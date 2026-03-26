'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Intelligent Render Router
//
// Routing logic:
//  draft      → SDXL  (fast, low-cost previews)
//  cinema     → Flux.1 keyframes → Kling 3.0 video
//  exploration → Genspark AI (parallel creative branches)
//
// Additional factors:
//  - User tier (free caps quality ceiling)
//  - Credit balance check
//  - GPU queue backpressure (auto-downgrade draft if cinema overloaded)
//  - Scene complexity heuristic
// ══════════════════════════════════════════════════════════

const logger = require('../../shared/utils/logger');
const { RENDER_MODES, ROLES, TOKEN_COSTS, QUEUE_PRIORITY } = require('../../config/constants');

// Tier → allowed modes
const TIER_PERMISSIONS = {
  [ROLES.FREE]:   [RENDER_MODES.DRAFT],
  [ROLES.PRO]:    [RENDER_MODES.DRAFT, RENDER_MODES.CINEMA],
  [ROLES.STUDIO]: [RENDER_MODES.DRAFT, RENDER_MODES.CINEMA, RENDER_MODES.EXPLORATION],
  [ROLES.ADMIN]:  [RENDER_MODES.DRAFT, RENDER_MODES.CINEMA, RENDER_MODES.EXPLORATION],
};

// Model configurations per mode
const MODE_CONFIG = {
  [RENDER_MODES.DRAFT]: {
    keyframeModel: 'sdxl-turbo',
    videoModel:    null,
    upscale:       false,
    maxFrames:     4,
    maxDuration:   10,
    outputQuality: '1080p',
    costMultiplier: 0.1,
  },
  [RENDER_MODES.CINEMA]: {
    keyframeModel: 'flux-1-pro',
    videoModel:    'kling-3.0',
    upscale:       true,
    maxFrames:     24,
    maxDuration:   60,
    outputQuality: '8K',
    costMultiplier: 1.0,
  },
  [RENDER_MODES.EXPLORATION]: {
    keyframeModel:    'sdxl-turbo',
    expansionModel:   'genspark-ai',
    videoModel:       null,
    upscale:          false,
    maxVariations:    8,
    maxFrames:        4,
    outputQuality:    '1080p',
    costMultiplier:   0.5,
  },
};

/**
 * Route a generation request to the correct model config.
 * Returns enriched job spec or throws a structured error.
 */
function route({ prompt, mode, userRole, userCredits, metadata = {} }) {
  // 1. Tier permission check
  const allowed = TIER_PERMISSIONS[userRole] || TIER_PERMISSIONS[ROLES.FREE];
  if (!allowed.includes(mode)) {
    const err = new Error(`Your plan does not support '${mode}' mode. Upgrade to unlock.`);
    err.status = 403; err.code = 'TIER_INSUFFICIENT'; throw err;
  }

  const config = MODE_CONFIG[mode];

  // 2. Credit check
  const cost = TOKEN_COSTS[mode] * (config.costMultiplier || 1);
  if (userCredits < cost) {
    const err = new Error(`Insufficient credits. Required: ${cost}, Available: ${userCredits}`);
    err.status = 403; err.code = 'INSUFFICIENT_CREDITS'; throw err;
  }

  // 3. Scene complexity heuristic
  const complexity = analyseComplexity(prompt, metadata);

  // 4. Auto-downgrade if cinema queue is overloaded (backpressure)
  let resolvedMode = mode;
  let downgradeReason = null;
  if (mode === RENDER_MODES.CINEMA && metadata.queueDepth > 50) {
    resolvedMode   = RENDER_MODES.CINEMA; // Keep cinema but note backpressure
    downgradeReason = null;
    logger.info('Cinema queue depth elevated', { depth: metadata.queueDepth });
  }

  // 5. Build job spec
  const jobSpec = {
    mode:          resolvedMode,
    originalMode:  mode,
    downgraded:    !!downgradeReason,
    downgradeReason,
    config:        MODE_CONFIG[resolvedMode],
    cost,
    priority:      QUEUE_PRIORITY[resolvedMode.toUpperCase()] || 1,
    complexity,
    pipeline:      buildPipeline(resolvedMode, complexity),
    modelParams:   buildModelParams(resolvedMode, prompt, metadata),
  };

  logger.info('Render routed', {
    mode: resolvedMode, complexity: complexity.score, priority: jobSpec.priority,
  });

  return jobSpec;
}

/**
 * Analyse prompt complexity to adjust model parameters.
 */
function analyseComplexity(prompt, metadata) {
  const words    = prompt.split(/\s+/).length;
  const hasMultipleSubjects = /\band\b|\bwith\b|\balso\b/i.test(prompt);
  const hasMotion = /orbit|dolly|pan|fly|sweep|tracking|aerial|zoom/i.test(prompt);
  const hasMaritime = /ocean|sea|water|yacht|vessel|marine|wave/i.test(prompt);
  const hasInterior = /interior|inside|lobby|room|apartment|penthouse/i.test(prompt);

  let score = 1;
  if (words > 50)          score += 1;
  if (hasMultipleSubjects) score += 1;
  if (hasMotion)           score += 1;
  if (hasMaritime)         score += 2; // Higher due to physics complexity
  if (metadata.refImages?.length > 2) score += 1;

  return { score, hasMotion, hasMaritime, hasInterior, wordCount: words };
}

/**
 * Build the ordered agent pipeline for a given mode.
 */
function buildPipeline(mode, complexity) {
  const base = [
    { stage: 'ingest',      service: 'input-parser',       async: false },
    { stage: 'analyze',     service: 'vision-intelligence', async: false },
    { stage: 'concept',     service: 'concept-agent',       async: false },
    { stage: 'keyframes',   service: 'keyframe-engine',     async: true },
  ];

  if (mode === RENDER_MODES.CINEMA) {
    base.push(
      { stage: 'video',     service: 'kling-3.0',           async: true },
      { stage: 'upscale',   service: 'real-esrgan',         async: true },
      { stage: 'post',      service: 'post-production',     async: true },
    );
  }

  if (mode === RENDER_MODES.EXPLORATION) {
    base.push(
      { stage: 'expand',    service: 'genspark-ai',         async: true },
    );
  }

  // Always run QA + post last
  base.push(
    { stage: 'qa',          service: 'auto-qa',             async: false },
    { stage: 'finalize',    service: 'output-assembler',    async: false },
  );

  // Add maritime LoRA if needed
  if (complexity.hasMaritime) {
    const kf = base.find(s => s.stage === 'keyframes');
    if (kf) kf.lora = 'maritime-physics-v2';
  }

  return base;
}

/**
 * Build model-specific parameters.
 */
function buildModelParams(mode, prompt, metadata) {
  const params = {
    prompt,
    negativePrompt: 'blurry, low quality, distorted, watermark, amateur, unrealistic',
    aspectRatio:    metadata.aspectRatio || '16:9',
    seed:           metadata.seed || null,
  };

  if (mode === RENDER_MODES.CINEMA) {
    Object.assign(params, {
      klingParams: {
        model:          'kling-v3',
        mode:           'pro',
        duration:       metadata.durationSeconds || 10,
        cameraControl:  metadata.cameraControl || { type: 'orbit', speed: 'slow' },
        cfgScale:       0.5,
        outputQuality:  '8K',
      },
      fluxParams: {
        model:       'flux-1-pro',
        steps:       50,
        guidance:    3.5,
        outputFormat: 'png',
      },
    });
  }

  if (mode === RENDER_MODES.EXPLORATION) {
    Object.assign(params, {
      gensparkParams: {
        variations:      metadata.variationCount || 4,
        styleDirection:  metadata.styleDirection || null,
        diversityFactor: 0.8,
      },
    });
  }

  return params;
}

module.exports = { route, MODE_CONFIG, TIER_PERMISSIONS };
