'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Projects Routes
// GET    /api/v1/projects
// POST   /api/v1/projects
// GET    /api/v1/projects/:projectId
// PATCH  /api/v1/projects/:projectId
// DELETE /api/v1/projects/:projectId
// GET    /api/v1/projects/:projectId/jobs
// GET    /api/v1/projects/:projectId/jobs/:jobId
// POST   /api/v1/projects/:projectId/jobs/:jobId/review
// GET    /api/v1/projects/:projectId/jobs/:jobId/stream
// ══════════════════════════════════════════════════════════

const router         = require('express').Router();
const projectService = require('../../services/projects/projects.service');
const { authenticate, requireRole } = require('../../shared/middleware/auth.middleware');
const {
  projectSchema, projectIdSchema, paginationSchema, hitlSchema,
} = require('../../shared/validators/schemas');
const { body, param } = require('express-validator');
const { validate }    = require('../../shared/validators/schemas');
const { HTTP, ROLES } = require('../../config/constants');
const logger          = require('../../shared/utils/logger');

// All project routes require authentication
router.use(authenticate);

// ── GET /projects ─────────────────────────────────────────
router.get(
  '/',
  paginationSchema,
  async (req, res, next) => {
    try {
      const { page = 1, limit = 20, sort = '-createdAt' } = req.query;
      const result = await projectService.listProjects({
        userId: req.user.id, page: +page, limit: +limit, sort,
      });
      res.status(HTTP.OK).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── POST /projects ────────────────────────────────────────
router.post(
  '/',
  projectSchema,
  async (req, res, next) => {
    try {
      const { name, industry, description } = req.body;
      const project = await projectService.createProject({
        userId: req.user.id, name, industry, description,
      });
      res.status(HTTP.CREATED).json({ project, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /projects/:projectId ──────────────────────────────
router.get(
  '/:projectId',
  projectIdSchema,
  async (req, res, next) => {
    try {
      const project = await projectService.getProject({
        projectId: req.params.projectId,
        userId:    req.user.id,
      });
      res.status(HTTP.OK).json({ project, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── PATCH /projects/:projectId ────────────────────────────
router.patch(
  '/:projectId',
  projectIdSchema,
  [
    body('name').optional().trim().isLength({ min: 1, max: 120 }).escape(),
    body('description').optional().trim().isLength({ max: 1000 }).escape(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const project = await projectService.updateProject({
        projectId:   req.params.projectId,
        userId:      req.user.id,
        updates:     req.body,
      });
      res.status(HTTP.OK).json({ project, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── DELETE /projects/:projectId ───────────────────────────
router.delete(
  '/:projectId',
  projectIdSchema,
  async (req, res, next) => {
    try {
      await projectService.deleteProject({
        projectId: req.params.projectId,
        userId:    req.user.id,
      });
      res.status(HTTP.NO_CONTENT).end();
    } catch (err) { next(err); }
  }
);

// ── GET /projects/:projectId/jobs ─────────────────────────
router.get(
  '/:projectId/jobs',
  projectIdSchema,
  paginationSchema,
  async (req, res, next) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await projectService.listJobs({
        projectId: req.params.projectId,
        userId:    req.user.id,
        page:      +page,
        limit:     +limit,
      });
      res.status(HTTP.OK).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /projects/:projectId/jobs/:jobId ──────────────────
router.get(
  '/:projectId/jobs/:jobId',
  [
    param('projectId').isUUID(),
    param('jobId').isUUID(),
    validate,
  ],
  async (req, res, next) => {
    try {
      const job = await projectService.getJobStatus({
        jobId:  req.params.jobId,
        userId: req.user.id,
      });
      res.status(HTTP.OK).json({ job, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── POST /projects/:projectId/jobs/:jobId/review ──────────
router.post(
  '/:projectId/jobs/:jobId/review',
  hitlSchema,
  async (req, res, next) => {
    try {
      const result = await projectService.submitHITLReview({
        jobId:       req.params.jobId,
        userId:      req.user.id,
        action:      req.body.action,
        adjustments: req.body.adjustments,
      });
      res.status(HTTP.OK).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── GET /projects/:projectId/jobs/:jobId/stream ───────────
// Server-Sent Events for real-time job progress
router.get(
  '/:projectId/jobs/:jobId/stream',
  [param('jobId').isUUID(), param('projectId').isUUID(), validate],
  async (req, res, next) => {
    try {
      // First validate the job belongs to this user
      await projectService.getJobStatus({ jobId: req.params.jobId, userId: req.user.id });

      res.setHeader('Content-Type',  'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Nginx unbuffered
      res.flushHeaders();

      const userId   = req.user.id;
      const jobId    = req.params.jobId;
      const clients  = global.sseClients || new Map();
      const userList = clients.get(userId) || [];
      userList.push(res);
      clients.set(userId, userList);

      // Send initial ping
      res.write(`event: connected\ndata: ${JSON.stringify({ jobId, timestamp: new Date().toISOString() })}\n\n`);

      // Poll Firestore every 3s for job updates
      const interval = setInterval(async () => {
        try {
          const job = await projectService.getJobStatus({ jobId, userId });
          res.write(`event: update\ndata: ${JSON.stringify({
            jobId,
            status:        job.status,
            currentStage:  job.currentStage,
            stageProgress: job.stageProgress,
            outputUrls:    job.outputUrls,
            qaResult:      job.qaResult,
            updatedAt:     job.updatedAt,
          })}\n\n`);

          // Close stream when job completes or fails
          if (['complete', 'failed', 'cancelled'].includes(job.status)) {
            res.write(`event: done\ndata: ${JSON.stringify({ status: job.status })}\n\n`);
            clearInterval(interval);
            res.end();
          }
        } catch (err) {
          logger.warn('SSE poll error', { jobId, error: err.message });
        }
      }, 3000);

      req.on('close', () => {
        clearInterval(interval);
        const remaining = (clients.get(userId) || []).filter(r => r !== res);
        if (remaining.length) clients.set(userId, remaining);
        else clients.delete(userId);
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
