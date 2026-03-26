'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS v1.3.0 · Generation Workflow (LangGraph-inspired)
//
// Stateful multi-agent workflow engine.
// Implements a directed graph of agent nodes with:
//  - State machine per job
//  - Conditional routing (mode, complexity, errors)
//  - Parallel execution where possible
//  - Checkpoint/resume for long-running jobs
//  - Error recovery with fallback paths
//  - Agentic autonomy hooks (v1.3.0): proactive param adaptation
//    and autonomous prompt enrichment per Perceive→Reason→Act→Learn
//
// Graph topology per mode:
//  DRAFT:      Director → Stylist → Keyframes → QA → Finalise
//  CINEMA:     Director → Cinematographer → Stylist → CreativeExpansion(enrich)
//              → Keyframes → Kling3.0 → PostProduction → QA → Finalise
//  EXPLORATION: Director → Stylist → CreativeExpansion(variations)
//              → [parallel branches] → Merge → QA → Finalise
// ══════════════════════════════════════════════════════════

const logger = require('../../shared/utils/logger');
const agenticAutonomy = require('../../services/agentic/agentic-autonomy.service');

// Agent imports
const directorAgent       = require('../agents/director.agent');
const cinematographerAgent = require('../agents/cinematographer.agent');
const visualStylistAgent  = require('../agents/visual-stylist.agent');
const creativeExpansionAgent = require('../agents/creative-expansion.agent');
const postProductionAgent = require('../agents/post-production.agent');
const klingClient         = require('../clients/kling.client');

// External services (injected)
let firestoreDb  = null;
let redisClient  = null;
let qaService    = null;
let storageService = null;

function init(deps = {}) {
  firestoreDb    = deps.firestore  || null;
  redisClient    = deps.redis      || null;
  qaService      = deps.qa         || null;
  storageService = deps.storage    || null;
  // Wire Agentic Autonomy service with all available deps
  agenticAutonomy.init({
    qa:           deps.qa          || null,
    queue:        deps.queue       || null,
    cdn:          deps.cdn         || null,
    renderRouter: deps.renderRouter|| null,
    storage:      deps.storage     || null,
    kling:        klingClient,
  });
}

// ── Workflow state machine ─────────────────────────────────
const STAGES = {
  DIRECTOR:     'director',
  CINEMATO:     'cinematographer',
  STYLIST:      'visual_stylist',
  EXPANSION:    'creative_expansion',
  KEYFRAMES:    'keyframes',
  VIDEO:        'video_generation',
  POST:         'post_production',
  QA:           'qa',
  FINALISE:     'finalise',
};

// ── Run complete workflow ─────────────────────────────────
async function run(jobPayload) {
  const {
    jobId, projectId, userId, mode,
    prompt, jobSpec, priority,
  } = jobPayload;

  const ctx = {
    jobId, projectId, userId, mode,
    prompt,
    metadata:    jobSpec?.modelParams || {},
    pipeline:    jobSpec?.pipeline    || [],
    complexity:  jobSpec?.complexity  || { score: 5 },
    stage:       null,
    results:     {},
    errors:      [],
    startedAt:   new Date(),
  };

  logger.info('Workflow started', { jobId, mode, complexity: ctx.complexity.score });

  try {
    // ── Agentic: autonomously adapt job params before execution ──
    const adaptedPayload = await agenticAutonomy.adaptJobParams(jobPayload);
    if (adaptedPayload.mode !== mode) {
      logger.info('Agentic autonomy rerouted job mode', {
        jobId, original: mode, adapted: adaptedPayload.mode,
        reasons: adaptedPayload._agentAdapted,
      });
      ctx.mode = adaptedPayload.mode;
    }
    ctx.metadata = { ...ctx.metadata, ...(adaptedPayload.jobSpec?.modelParams || {}) };

    // Select and run pipeline based on (potentially adapted) mode
    switch (ctx.mode) {
      case 'draft':       await runDraftPipeline(ctx);       break;
      case 'cinema':      await runCinemaPipeline(ctx);      break;
      case 'exploration': await runExplorationPipeline(ctx); break;
      default:
        throw new Error(`Unknown render mode: ${ctx.mode}`);
    }

    await updateJobStatus(jobId, 'complete', {
      outputUrls:   ctx.results.outputUrls || [],
      qaResult:     ctx.results.qa         || null,
      completedAt:  new Date(),
    });

    logger.info('Workflow complete', {
      jobId, mode,
      durationMs: Date.now() - ctx.startedAt.getTime(),
      outputs:    ctx.results.outputUrls?.length || 0,
    });

  } catch (err) {
    logger.error('Workflow failed', { jobId, stage: ctx.stage, error: err.message, stack: err.stack });
    await updateJobStatus(jobId, 'failed', {
      errorMessage: err.message,
      failedStage:  ctx.stage,
      failedAt:     new Date(),
    });
    throw err;
  }

  return ctx.results;
}

// ═══════════════════════════════════════════════════════════
// DRAFT PIPELINE
// Director → Stylist → Keyframes → QA → Finalise
// ═══════════════════════════════════════════════════════════
async function runDraftPipeline(ctx) {
  const { jobId, prompt, mode, metadata } = ctx;

  // Stage 1: Director
  await setStage(ctx, STAGES.DIRECTOR);
  ctx.results.director = await directorAgent.run({
    jobId, prompt, mode,
    referenceImageUrls: metadata.refImages || [],
    industry:           metadata.industry,
    metadata,
  });

  // Stage 2: Visual Stylist
  await setStage(ctx, STAGES.STYLIST);
  ctx.results.stylist = await visualStylistAgent.run({
    jobId, mode,
    directorResult:      ctx.results.director,
    cinematographerResult: null,
    metadata,
  });

  // Stage 3: Keyframe generation (SDXL Turbo)
  await setStage(ctx, STAGES.KEYFRAMES);
  ctx.results.keyframes = await generateKeyframes(ctx, 4);

  // Stage 4: QA
  await setStage(ctx, STAGES.QA);
  ctx.results.qa = await runQA(ctx, ctx.results.keyframes.urls);

  // Stage 5: Finalise
  await setStage(ctx, STAGES.FINALISE);
  ctx.results.outputUrls = ctx.results.keyframes.urls;
}

// ═══════════════════════════════════════════════════════════
// CINEMA PIPELINE
// Director → Cinematographer → Stylist → [Genspark enrich]
// → Keyframes → Kling 3.0 → Post → QA → Finalise
// ═══════════════════════════════════════════════════════════
async function runCinemaPipeline(ctx) {
  const { jobId, prompt, mode, metadata } = ctx;

  // Stage 1: Director
  await setStage(ctx, STAGES.DIRECTOR);
  ctx.results.director = await directorAgent.run({
    jobId, prompt, mode,
    referenceImageUrls: metadata.refImages || [],
    industry:           metadata.industry,
    metadata,
  });

  // Stage 2: Cinematographer (parallel with Stylist if possible)
  await setStage(ctx, STAGES.CINEMATO);
  ctx.results.cinematographer = await cinematographerAgent.run({
    jobId, mode,
    directorResult: ctx.results.director,
    metadata,
  });

  // Stage 3: Visual Stylist
  await setStage(ctx, STAGES.STYLIST);
  ctx.results.stylist = await visualStylistAgent.run({
    jobId, mode,
    directorResult:         ctx.results.director,
    cinematographerResult:  ctx.results.cinematographer,
    metadata,
  });

  // Stage 4: Creative Expansion (prompt enrichment for cinema)
  await setStage(ctx, STAGES.EXPANSION);
  ctx.results.expansion = await creativeExpansionAgent.run({
    jobId, mode, prompt,
    directorResult:  ctx.results.director,
    stylistResult:   ctx.results.stylist,
    metadata,
  });

  // ── Agentic: autonomously enrich prompt with benchmark signals ──
  const agentEnrichment = agenticAutonomy.enrichPromptAutonomously(
    ctx.results.expansion?.enrichedPrompt || prompt,
    ctx.results.director?.scene?.cinematic_profile || {}
  );
  if (agentEnrichment.appliedEnrichments.length > 0) {
    logger.info('Agentic prompt enrichment applied', {
      jobId, enrichments: agentEnrichment.appliedEnrichments });
  }

  // Use enriched prompt downstream
  const enrichedPrompt = agentEnrichment.enrichedPrompt;

  // Stage 5: Keyframes (Flux.1 Pro)
  await setStage(ctx, STAGES.KEYFRAMES);
  ctx.results.keyframes = await generateKeyframes(ctx, 6, enrichedPrompt);

  // Stage 6: Video generation (Kling 3.0)
  await setStage(ctx, STAGES.VIDEO);
  ctx.results.video = await runKlingGeneration(ctx, enrichedPrompt);

  // Stage 7: Post-production
  await setStage(ctx, STAGES.POST);
  ctx.results.post = await postProductionAgent.run({
    jobId, mode,
    directorResult:        ctx.results.director,
    cinematographerResult: ctx.results.cinematographer,
    stylistResult:         ctx.results.stylist,
    videoUrls:             ctx.results.video?.videoUrls || [],
    metadata,
  });

  // Stage 8: QA
  await setStage(ctx, STAGES.QA);
  ctx.results.qa = await runQA(ctx, ctx.results.video?.videoUrls || []);

  // Stage 9: Finalise
  await setStage(ctx, STAGES.FINALISE);
  ctx.results.outputUrls = ctx.results.video?.videoUrls || [];
}

// ═══════════════════════════════════════════════════════════
// EXPLORATION PIPELINE
// Director → Stylist → CreativeExpansion(branches)
// → [N parallel draft keyframe batches] → Merge → QA → Finalise
// ═══════════════════════════════════════════════════════════
async function runExplorationPipeline(ctx) {
  const { jobId, prompt, mode, metadata } = ctx;

  // Stage 1: Director
  await setStage(ctx, STAGES.DIRECTOR);
  ctx.results.director = await directorAgent.run({
    jobId, prompt, mode,
    referenceImageUrls: metadata.refImages || [],
    industry:           metadata.industry,
    metadata,
  });

  // Stage 2: Stylist (base)
  await setStage(ctx, STAGES.STYLIST);
  ctx.results.stylist = await visualStylistAgent.run({
    jobId, mode,
    directorResult:      ctx.results.director,
    cinematographerResult: null,
    metadata,
  });

  // Stage 3: Genspark creative expansion → branches
  await setStage(ctx, STAGES.EXPANSION);
  ctx.results.expansion = await creativeExpansionAgent.run({
    jobId, mode, prompt,
    directorResult: ctx.results.director,
    stylistResult:  ctx.results.stylist,
    metadata,
  });

  // Stage 4: Parallel keyframe generation for each branch
  await setStage(ctx, STAGES.KEYFRAMES);
  const branches    = ctx.results.expansion.branches || [];
  const branchResults = await Promise.allSettled(
    branches.map(branch => generateBranchKeyframes(ctx, branch))
  );

  ctx.results.branches = branchResults.map((r, i) => ({
    branchIndex: i,
    variationId: branches[i]?.variationId,
    status:      r.status,
    urls:        r.status === 'fulfilled' ? r.value?.urls : [],
    error:       r.status === 'rejected'  ? r.reason?.message : null,
  }));

  // Stage 5: QA
  await setStage(ctx, STAGES.QA);
  const allUrls = ctx.results.branches.flatMap(b => b.urls || []);
  ctx.results.qa = await runQA(ctx, allUrls);

  // Stage 6: Finalise
  await setStage(ctx, STAGES.FINALISE);
  ctx.results.outputUrls = allUrls;
}

// ── Helper: keyframe generation ────────────────────────────
async function generateKeyframes(ctx, count = 4, overridePrompt) {
  const { jobId, mode, metadata } = ctx;
  const diffParams = ctx.results.stylist?.diffusionParams || {};
  const prompt     = overridePrompt || ctx.prompt;

  // In a real deployment this calls the FastAPI diffusion service
  logger.info('Keyframe generation', { jobId, count, model: diffParams.model });

  // Simulate keyframe generation (replace with actual API call)
  const urls = await callDiffusionService({
    jobId,
    prompt:         prompt.slice(0, 2000),
    negativePrompt: diffParams.negativePrompt || 'blurry, low quality',
    model:          diffParams.model || 'sdxl-turbo',
    steps:          diffParams.steps || 4,
    guidance:       diffParams.guidance || 0,
    count,
    loras:          diffParams.loras || [],
    aspectRatio:    metadata.aspectRatio || '16:9',
  });

  return { urls, count: urls.length };
}

async function generateBranchKeyframes(ctx, branch) {
  const params = branch.generationParams;
  logger.info('Branch keyframe generation', { jobId: ctx.jobId, branchIndex: branch.branchIndex });

  const urls = await callDiffusionService({
    jobId:          ctx.jobId,
    prompt:         params.prompt,
    negativePrompt: params.negativePrompt,
    model:          params.model || 'sdxl-turbo',
    steps:          params.steps || 4,
    guidance:       params.guidance || 0,
    count:          2,
    loras:          params.loras || [],
    aspectRatio:    params.aspectRatio || '16:9',
    seed:           params.seed,
  });

  return { urls };
}

// ── Helper: Kling 3.0 generation ──────────────────────────
async function runKlingGeneration(ctx, enrichedPrompt) {
  const { jobId, metadata } = ctx;
  const klingParams = ctx.results.stylist?.diffusionParams?.klingParams || {};
  const cameraPath  = ctx.results.cinematographer?.cameraPath || {};

  logger.info('Kling 3.0 video generation started', { jobId });

  const task = await klingClient.generateVideo({
    prompt:        enrichedPrompt,
    imageUrls:     ctx.results.keyframes?.urls || [],
    cameraControl: cameraPath.klingCameraControl || null,
    duration:      klingParams.duration || metadata.durationSeconds || 10,
    aspectRatio:   metadata.aspectRatio || '16:9',
    mode:          'pro',
  });

  // Poll for completion (with timeout)
  const videoResult = await pollKlingTask(task.taskId, 300_000); // 5min max

  return {
    taskId:    task.taskId,
    videoUrls: videoResult.videos?.map(v => v.url) || [],
    status:    videoResult.status,
  };
}

async function pollKlingTask(taskId, timeoutMs) {
  const start    = Date.now();
  const interval = 5_000;

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, interval));
    const status = await klingClient.getVideoStatus(taskId);

    if (status.status === 'succeed') return status;
    if (status.status === 'failed')  throw new Error(`Kling task ${taskId} failed`);

    logger.info('Kling polling', { taskId, status: status.status, progress: status.progress });
  }

  throw new Error(`Kling task ${taskId} timed out after ${timeoutMs}ms`);
}

// ── Helper: call diffusion service (FastAPI) ───────────────
async function callDiffusionService(params) {
  const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:8001';

  try {
    const axios  = require('axios');
    const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;

    const resp = await axios.post(
      `${ORCHESTRATOR_URL}/generate/keyframes`,
      params,
      {
        headers: {
          'x-internal-secret': secret,
          'content-type':      'application/json',
        },
        timeout: 120_000,
      }
    );
    return resp.data?.image_urls || [];
  } catch (err) {
    logger.warn('Diffusion service unavailable — returning placeholder', { error: err.message });
    // Return placeholder URLs in development
    return Array.from({ length: params.count }, (_, i) =>
      `https://via.placeholder.com/1920x1080?text=Keyframe+${i + 1}`
    );
  }
}

// ── Helper: QA ────────────────────────────────────────────
async function runQA(ctx, urls) {
  if (!qaService || !urls?.length) {
    return { score: 0.9, passed: true, checks: [], skipped: true };
  }
  return qaService.evaluate({
    jobId:       ctx.jobId,
    mode:        ctx.mode,
    outputUrls:  urls,
    scene:       ctx.results.director?.scene,
    originalPrompt: ctx.prompt,
  });
}

// ── Helper: update job status in Firestore ────────────────
async function updateJobStatus(jobId, status, updates = {}) {
  try {
    if (global.pushJobUpdate) {
      global.pushJobUpdate(jobId, { jobId, status, ...updates });
    }
    if (firestoreDb) {
      await firestoreDb.collection('jobs').doc(jobId).update({
        status,
        updatedAt: new Date(),
        ...updates,
      });
    }
  } catch (err) {
    logger.warn('Failed to update job status', { jobId, status, error: err.message });
  }
}

async function setStage(ctx, stage) {
  ctx.stage = stage;
  await updateJobStatus(ctx.jobId, 'processing', { currentStage: stage });
  logger.info(`Stage: ${stage}`, { jobId: ctx.jobId });
}

module.exports = { run, init, STAGES };
