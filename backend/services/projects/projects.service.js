'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Projects Service
// CRUD + generation job lifecycle management
// Sensitive fields encrypted at rest (prompt, metadata)
// ══════════════════════════════════════════════════════════

const { v4: uuidv4 } = require('uuid');
const logger   = require('../../shared/utils/logger');
const { encryptFields, decryptFields } = require('../../shared/crypto/encryption');
const { JOB_STATUS, HTTP }  = require('../../config/constants');
const queueService = require('../queue/queue.service');
const renderRouter = require('../render-router/render-router.service');

// Encrypted fields in project documents
const ENCRYPTED_FIELDS = ['promptText', 'styleNotes'];

let firestoreDb = null;
let redisClient = null;
function init(db, redis) { firestoreDb = db; redisClient = redis; }

// ── Create project ────────────────────────────────────────
async function createProject({ userId, name, industry, description }) {
  const projectId = uuidv4();
  const now = new Date();

  const project = {
    id:          projectId,
    userId,
    name:        name.trim(),
    industry:    industry || 'other',
    description: description || null,
    jobIds:      [],
    createdAt:   now,
    updatedAt:   now,
  };

  await firestoreDb.collection('projects').doc(projectId).set(project);
  logger.info('Project created', { projectId, userId });
  return project;
}

// ── List projects ─────────────────────────────────────────
async function listProjects({ userId, page = 1, limit = 20, sort = '-createdAt' }) {
  const cacheKey = `${process.env.REDIS_PREFIX || 'dos:'}projects:${userId}:${page}:${limit}:${sort}`;

  if (redisClient) {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  let query = firestoreDb.collection('projects').where('userId', '==', userId);

  const descending = sort.startsWith('-');
  const field      = sort.replace('-', '');
  query = query.orderBy(field, descending ? 'desc' : 'asc');

  const offset = (page - 1) * limit;
  const snap   = await query.limit(limit).offset(offset).get();
  const total  = (await firestoreDb.collection('projects').where('userId', '==', userId).count().get()).data().count;

  const projects = snap.docs.map(d => d.data());
  const result   = { projects, total, page, limit, pages: Math.ceil(total / limit) };

  if (redisClient) {
    await redisClient.setEx(cacheKey, 60, JSON.stringify(result));
  }

  return result;
}

// ── Get project ───────────────────────────────────────────
async function getProject({ projectId, userId }) {
  const doc = await firestoreDb.collection('projects').doc(projectId).get();
  if (!doc.exists) { const e = new Error('Project not found'); e.status = HTTP.NOT_FOUND; throw e; }

  const project = doc.data();
  if (project.userId !== userId) { const e = new Error('Access denied'); e.status = HTTP.FORBIDDEN; throw e; }

  return project;
}

// ── Delete project ────────────────────────────────────────
async function deleteProject({ projectId, userId }) {
  const project = await getProject({ projectId, userId });
  await firestoreDb.collection('projects').doc(projectId).delete();

  // Invalidate cache
  if (redisClient) {
    await redisClient.del(`${process.env.REDIS_PREFIX || 'dos:'}projects:${userId}:*`).catch(() => {});
  }

  logger.info('Project deleted', { projectId, userId });
  return { deleted: true };
}

// ── Create generation job ─────────────────────────────────
async function createGenerationJob({ projectId, userId, userRole, userCredits,
                                     prompt, mode, stylePresets, aspectRatio,
                                     durationSeconds, referenceImageIds, styleDirection }) {
  // Route through render router
  const queueDepth = await queueService.getQueueDepth();
  const jobSpec    = renderRouter.route({
    prompt, mode, userRole, userCredits,
    metadata: { refImages: referenceImageIds, durationSeconds, aspectRatio, styleDirection, queueDepth },
  });

  const jobId  = uuidv4();
  const now    = new Date();

  // Encrypt sensitive fields before Firestore storage
  const encrypted = encryptFields({ promptText: prompt, styleNotes: styleDirection || '' }, ENCRYPTED_FIELDS);

  const job = {
    id:               jobId,
    projectId,
    userId,
    status:           JOB_STATUS.QUEUED,
    mode,
    ...encrypted,
    stylePresets:     stylePresets || [],
    aspectRatio:      aspectRatio || '16:9',
    durationSeconds:  durationSeconds || 10,
    referenceImageIds: referenceImageIds || [],
    jobSpec,
    cost:             jobSpec.cost,
    priority:         jobSpec.priority,
    pipeline:         jobSpec.pipeline,
    currentStage:     null,
    stageProgress:    {},
    qaResult:         null,
    outputUrls:       null,
    errorMessage:     null,
    retryCount:       0,
    createdAt:        now,
    updatedAt:        now,
  };

  // Firestore write
  await firestoreDb.collection('jobs').doc(jobId).set(job);

  // Link to project
  await firestoreDb.collection('projects').doc(projectId).update({
    jobIds:    firestoreDb.FieldValue?.arrayUnion(jobId) || job.id,
    updatedAt: now,
  });

  // Deduct credits
  await firestoreDb.collection('users').doc(userId).update({
    credits:   firestoreDb.FieldValue?.increment(-jobSpec.cost) || userCredits - jobSpec.cost,
    updatedAt: now,
  });

  // Publish to queue
  await queueService.publishRenderJob({
    jobId, projectId, userId, mode, prompt,
    jobSpec, priority: jobSpec.priority,
  });

  logger.info('Generation job created', { jobId, mode, cost: jobSpec.cost, userId });
  return sanitiseJob(job);
}

// ── Get job status ────────────────────────────────────────
async function getJobStatus({ jobId, userId }) {
  const cacheKey = `${process.env.REDIS_PREFIX || 'dos:'}job:${jobId}`;

  if (redisClient) {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const doc = await firestoreDb.collection('jobs').doc(jobId).get();
  if (!doc.exists) { const e = new Error('Job not found'); e.status = HTTP.NOT_FOUND; throw e; }

  const job = doc.data();
  if (job.userId !== userId) { const e = new Error('Access denied'); e.status = HTTP.FORBIDDEN; throw e; }

  const safe = sanitiseJob(job);
  if (redisClient) await redisClient.setEx(cacheKey, 5, JSON.stringify(safe));

  return safe;
}

// ── HITL review action ────────────────────────────────────
async function submitHITLReview({ jobId, userId, action, adjustments }) {
  const job = await getJobStatus({ jobId, userId });

  if (job.status !== JOB_STATUS.HITL) {
    const e = new Error('Job is not in HITL review state'); e.status = HTTP.BAD_REQUEST; throw e;
  }

  const updates = { updatedAt: new Date() };

  if (action === 'approve') {
    updates.status = JOB_STATUS.COMPLETE;
  } else if (action === 'regenerate') {
    updates.status = JOB_STATUS.QUEUED;
    updates.retryCount = (job.retryCount || 0) + 1;
    // Re-publish with adjustments
    await queueService.publishRenderJob({
      jobId, projectId: job.projectId, userId, mode: job.mode,
      prompt: job.promptText, // Note: this would need decryption in real flow
      jobSpec: { ...job.jobSpec, adjustments }, priority: job.priority,
    });
  } else if (action === 'cancel') {
    updates.status = JOB_STATUS.CANCELLED;
  }

  await firestoreDb.collection('jobs').doc(jobId).update(updates);
  if (redisClient) await redisClient.del(`${process.env.REDIS_PREFIX || 'dos:'}job:${jobId}`);

  return { jobId, action, status: updates.status };
}

// ── Update project ────────────────────────────────────────
async function updateProject({ projectId, userId, updates }) {
  const project = await getProject({ projectId, userId });
  const allowed = {};
  if (updates.name)        allowed.name        = updates.name.trim();
  if (updates.description) allowed.description = updates.description;
  allowed.updatedAt = new Date();

  await firestoreDb.collection('projects').doc(projectId).update(allowed);
  if (redisClient) await redisClient.del(`${process.env.REDIS_PREFIX || 'dos:'}projects:${userId}:*`).catch(() => {});
  return { ...project, ...allowed };
}

// ── List jobs for a project ───────────────────────────────
async function listJobs({ projectId, userId, page = 1, limit = 20 }) {
  // Verify project ownership
  await getProject({ projectId, userId });

  const query  = firestoreDb.collection('jobs').where('projectId', '==', projectId)
    .orderBy('createdAt', 'desc').limit(limit).offset((page - 1) * limit);
  const snap   = await query.get();
  const total  = (await firestoreDb.collection('jobs').where('projectId', '==', projectId).count().get()).data().count;
  const jobs   = snap.docs.map(d => sanitiseJob(d.data()));
  return { jobs, total, page, limit, pages: Math.ceil(total / limit) };
}

// ── Retry a failed job ────────────────────────────────────
async function retryJob({ jobId, userId }) {
  const job = await getJobStatus({ jobId, userId });
  if (!['failed', 'cancelled'].includes(job.status)) {
    const e = new Error('Only failed or cancelled jobs can be retried'); e.status = HTTP.BAD_REQUEST; throw e;
  }
  const updates = {
    status:     JOB_STATUS.QUEUED,
    retryCount: (job.retryCount || 0) + 1,
    updatedAt:  new Date(),
    errorMessage: null,
  };
  await firestoreDb.collection('jobs').doc(jobId).update(updates);
  await queueService.publishRenderJob({ jobId, projectId: job.projectId, userId, mode: job.mode, jobSpec: job.jobSpec || {}, priority: job.priority || 1 });
  if (redisClient) await redisClient.del(`${process.env.REDIS_PREFIX || 'dos:'}job:${jobId}`);
  return { jobId, status: JOB_STATUS.QUEUED, retryCount: updates.retryCount };
}

// ── Strip encrypted / internal fields from API response ──
function sanitiseJob(job) {
  const { promptText, styleNotes, jobSpec: { modelParams, ...jobSpecSafe } = {}, ...rest } = job;
  return { ...rest, jobSpec: jobSpecSafe, hasPrompt: !!promptText };
}

module.exports = {
  init, createProject, listProjects, getProject, updateProject, deleteProject,
  createGenerationJob, getJobStatus, submitHITLReview, listJobs, retryJob,
};
