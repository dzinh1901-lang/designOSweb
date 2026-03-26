'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Generation Routes
// POST /api/v1/generate             – Create a new generation job
// POST /api/v1/generate/variations  – Branch variations from existing job
// GET  /api/v1/generate/modes       – Available modes for user tier
// GET  /api/v1/generate/presets     – Style presets library
// POST /api/v1/generate/:jobId/cancel  – Cancel a running job
// POST /api/v1/generate/:jobId/retry   – Retry a failed job
// ══════════════════════════════════════════════════════════

const router         = require('express').Router();
const projectService = require('../../services/projects/projects.service');
const { authenticate, requireRole, requireCredits } = require('../../shared/middleware/auth.middleware');
const { generateLimiter }   = require('../../shared/middleware/security');
const { generateSchema, variationsSchema } = require('../../shared/validators/schemas');
const { body, param, query } = require('express-validator');
const { validate }  = require('../../shared/validators/schemas');
const { HTTP, RENDER_MODES, ROLES, TOKEN_COSTS, CACHE_TTL } = require('../../config/constants');
const { MODE_CONFIG, TIER_PERMISSIONS } = require('../../services/render-router/render-router.service');
const logger        = require('../../shared/utils/logger');

router.use(authenticate);

// ── Style presets library ─────────────────────────────────
const STYLE_PRESETS = [
  // Commercial Real Estate
  { id: 'cre-luxury',    name: 'Luxury CRE',        category: 'commercial_real_estate', thumbnail: null,
    params: { lighting: 'golden hour', atmosphere: 'prestigious', palette: 'warm neutrals' } },
  { id: 'cre-minimal',   name: 'Minimalist Modern',  category: 'commercial_real_estate', thumbnail: null,
    params: { lighting: 'diffused white', atmosphere: 'clean', palette: 'white and concrete' } },
  { id: 'cre-aerial',    name: 'Aerial Urban',       category: 'commercial_real_estate', thumbnail: null,
    params: { cameraType: 'aerial', altitude: 'high', atmosphere: 'urban fog' } },
  // Maritime
  { id: 'mar-ocean',     name: 'Open Ocean',         category: 'maritime', thumbnail: null,
    params: { lora: 'maritime-physics-v2', lighting: 'midday sun', waves: 'moderate' } },
  { id: 'mar-sunset',    name: 'Maritime Sunset',    category: 'maritime', thumbnail: null,
    params: { lora: 'maritime-physics-v2', lighting: 'golden sunset', atmosphere: 'hazy horizon' } },
  { id: 'mar-storm',     name: 'Dramatic Storm',     category: 'maritime', thumbnail: null,
    params: { lora: 'maritime-physics-v2', lighting: 'storm clouds', waves: 'high' } },
  // Luxury Branding
  { id: 'lux-editorial', name: 'Editorial Fashion',  category: 'luxury_branding', thumbnail: null,
    params: { lighting: 'studio strobe', atmosphere: 'dramatic contrast', palette: 'monochrome gold' } },
  { id: 'lux-cinematic', name: 'Cinematic Noir',     category: 'luxury_branding', thumbnail: null,
    params: { lighting: 'low key chiaroscuro', atmosphere: 'mystery', palette: 'deep blacks' } },
  // Universal
  { id: 'uni-timelapse', name: 'Time-Lapse Sky',     category: 'universal', thumbnail: null,
    params: { motion: 'time-lapse', sky: 'dramatic clouds', transition: 'day-to-night' } },
  { id: 'uni-orbit',     name: 'Orbital Reveal',     category: 'universal', thumbnail: null,
    params: { camera: { type: 'orbit', axis: 'y', speed: 'slow' } } },
];

// ── GET /generate/presets ─────────────────────────────────
router.get(
  '/presets',
  [query('category').optional().isString().trim(), validate],
  async (req, res) => {
    const { category } = req.query;
    const presets = category
      ? STYLE_PRESETS.filter(p => p.category === category || p.category === 'universal')
      : STYLE_PRESETS;
    res.status(HTTP.OK).json({ presets, requestId: req.requestId });
  }
);

// ── GET /generate/modes ───────────────────────────────────
router.get(
  '/modes',
  async (req, res) => {
    const allowed = TIER_PERMISSIONS[req.user.role] || [];
    const modes   = Object.values(RENDER_MODES).map(mode => ({
      mode,
      available: allowed.includes(mode),
      cost:      TOKEN_COSTS[mode],
      config:    allowed.includes(mode) ? MODE_CONFIG[mode] : undefined,
      requiresUpgrade: !allowed.includes(mode),
    }));
    res.status(HTTP.OK).json({ modes, credits: req.user.credits, requestId: req.requestId });
  }
);

// ── POST /generate ────────────────────────────────────────
router.post(
  '/',
  generateLimiter,
  generateSchema,
  async (req, res, next) => {
    try {
      const {
        project_id, prompt, mode,
        style_presets, aspect_ratio, duration_seconds,
        reference_image_ids, style_direction,
      } = req.body;

      if (!project_id) {
        return res.status(HTTP.BAD_REQUEST).json({
          error: 'project_id is required', requestId: req.requestId,
        });
      }

      const job = await projectService.createGenerationJob({
        projectId:         project_id,
        userId:            req.user.id,
        userRole:          req.user.role,
        userCredits:       req.user.credits,
        prompt,
        mode,
        stylePresets:      style_presets || [],
        aspectRatio:       aspect_ratio  || '16:9',
        durationSeconds:   duration_seconds || 10,
        referenceImageIds: reference_image_ids || [],
        styleDirection:    style_direction,
      });

      res.status(HTTP.ACCEPTED).json({
        job,
        message:   `Generation job queued — mode: ${mode}`,
        streamUrl: `/api/v1/projects/${job.projectId}/jobs/${job.id}/stream`,
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── POST /generate/variations ─────────────────────────────
router.post(
  '/variations',
  generateLimiter,
  variationsSchema,
  [
    body('source_job_id').isUUID().withMessage('Valid source job ID required'),
    body('project_id').isUUID().withMessage('Valid project ID required'),
    validate,
  ],
  async (req, res, next) => {
    try {
      const { source_job_id, project_id, count = 4, style_direction } = req.body;

      // Validate source job ownership
      const sourceJob = await projectService.getJobStatus({
        jobId: source_job_id, userId: req.user.id,
      });

      if (!['complete', 'hitl_review'].includes(sourceJob.status)) {
        return res.status(HTTP.BAD_REQUEST).json({
          error:     'Source job must be complete before creating variations',
          requestId: req.requestId,
        });
      }

      // Create variation jobs (exploration mode)
      const jobs = await Promise.all(
        Array.from({ length: Math.min(count, 8) }, (_, i) =>
          projectService.createGenerationJob({
            projectId:       project_id,
            userId:          req.user.id,
            userRole:        req.user.role,
            userCredits:     req.user.credits - (i * TOKEN_COSTS.exploration),
            prompt:          sourceJob.hasPrompt ? '[inherited from source]' : style_direction || '',
            mode:            RENDER_MODES.EXPLORATION,
            stylePresets:    [],
            variationIndex:  i,
            sourceJobId:     source_job_id,
            styleDirection:  style_direction,
          })
        )
      );

      res.status(HTTP.ACCEPTED).json({
        jobs:      jobs.filter(Boolean),
        count:     jobs.length,
        requestId: req.requestId,
      });
    } catch (err) { next(err); }
  }
);

// ── POST /generate/:jobId/cancel ──────────────────────────
router.post(
  '/:jobId/cancel',
  [param('jobId').isUUID(), validate],
  async (req, res, next) => {
    try {
      const result = await projectService.submitHITLReview({
        jobId:  req.params.jobId,
        userId: req.user.id,
        action: 'cancel',
      });
      res.status(HTTP.OK).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

// ── POST /generate/:jobId/retry ───────────────────────────
router.post(
  '/:jobId/retry',
  [param('jobId').isUUID(), validate],
  async (req, res, next) => {
    try {
      const result = await projectService.retryJob({
        jobId:  req.params.jobId,
        userId: req.user.id,
      });
      res.status(HTTP.ACCEPTED).json({ ...result, requestId: req.requestId });
    } catch (err) { next(err); }
  }
);

module.exports = router;
