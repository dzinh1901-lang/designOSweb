'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Creative Expansion Agent (Genspark AI)
//
// Used in Exploration mode:
//  - Receives Director's scene + Visual Stylist parameters
//  - Calls Genspark AI to generate N parallel branches
//  - Each branch: distinct style, lighting, camera angle
//  - Outputs array of job specs for parallel keyframe gen
//  - Also used for prompt enrichment in Cinema mode
// ══════════════════════════════════════════════════════════

const gensparkClient = require('../clients/genspark.client');
const logger         = require('../../shared/utils/logger');

// ── Run Creative Expansion agent ──────────────────────────
async function run({ jobId, mode, prompt, directorResult, stylistResult, metadata = {} }) {
  const start = Date.now();
  logger.info('Creative Expansion agent started', { jobId, mode });

  try {
    const { scene } = directorResult;
    const count     = metadata.variationCount || (mode === 'exploration' ? 4 : 1);
    const isExplore = mode === 'exploration';

    // ── Exploration mode: generate variations ──────────────
    if (isExplore) {
      const variations = await gensparkClient.generateVariations({
        basePrompt:      buildEnrichedPrompt(prompt, scene),
        count,
        styleDirection:  metadata.styleDirection || stylistResult?.styleEmbeds?.[1]?.prompt,
        diversityFactor: metadata.diversityFactor || 0.8,
        industry:        scene.industry,
        referenceUrls:   metadata.referenceImageUrls || [],
      });

      const branches = variations.variations.map((v, i) => buildBranch(v, i, scene, stylistResult));

      const result = {
        agent:        'creative-expansion',
        jobId,
        durationMs:   Date.now() - start,
        mode:         'variations',
        totalBranches: branches.length,
        branches,
        gensparkTaskId: variations.taskId,
      };

      logger.info('Creative Expansion agent complete', {
        jobId, branches: branches.length, durationMs: result.durationMs,
      });
      return result;
    }

    // ── Cinema / Draft mode: prompt enrichment only ────────
    const enriched = await gensparkClient.enrichPrompt({
      rawPrompt: prompt,
      industry:  scene.industry,
      mode,
    });

    const result = {
      agent:          'creative-expansion',
      jobId,
      durationMs:     Date.now() - start,
      mode:           'enrichment',
      enrichedPrompt: enriched.enrichedPrompt,
      sceneAdditions: enriched.sceneDescription,
      confidence:     enriched.confidence,
      branches:       [], // Not used in cinema mode
    };

    logger.info('Creative Expansion agent (enrichment) complete', {
      jobId, confidence: enriched.confidence, durationMs: result.durationMs,
    });
    return result;

  } catch (err) {
    logger.error('Creative Expansion agent failed', { jobId, error: err.message });

    // Graceful fallback — return base prompt as single "branch"
    return {
      agent:        'creative-expansion',
      jobId,
      durationMs:   Date.now() - start,
      mode:         mode === 'exploration' ? 'variations' : 'enrichment',
      totalBranches: 1,
      branches:     [buildFallbackBranch(prompt, directorResult.scene, 0)],
      enrichedPrompt: prompt,
      fallback:     true,
      error:        err.message,
    };
  }
}

// ── Build enriched prompt from scene ──────────────────────
function buildEnrichedPrompt(rawPrompt, scene) {
  const parts = [rawPrompt.trim()];

  const env = scene.environment || {};
  if (env.time_of_day)  parts.push(`${env.time_of_day} lighting`);
  if (env.weather && env.weather !== 'clear') parts.push(`${env.weather} atmosphere`);
  if (env.atmosphere)   parts.push(env.atmosphere);
  if (scene.lighting?.primary) parts.push(scene.lighting.primary);

  return parts.join(', ');
}

// ── Build branch object from Genspark variation ───────────
function buildBranch(variation, index, scene, stylistResult) {
  return {
    branchIndex:       index,
    variationId:       variation.id,
    prompt:            variation.prompt,
    styleEmphasis:     variation.styleEmphasis || [],
    tags:              variation.tags || [],
    diversityScore:    variation.diversityScore || 0,
    generationParams: {
      prompt:         variation.prompt,
      negativePrompt: stylistResult?.diffusionParams?.negativePrompt || 'blurry, low quality',
      loras:          stylistResult?.loras?.map(l => ({ id: l.id, strength: l.strength })) || [],
      aspectRatio:    '16:9',
      steps:          4,                    // Draft quality for variations
      model:          'sdxl-turbo',
      seed:           null,                 // Random per variation
    },
    estimatedCost:     0.1,
  };
}

// ── Fallback branch when Genspark is unavailable ──────────
function buildFallbackBranch(prompt, scene, index) {
  return {
    branchIndex:       index,
    variationId:       `fallback_${index}`,
    prompt,
    styleEmphasis:     [scene.environment?.time_of_day || 'golden_hour'],
    tags:              [scene.industry || 'general'],
    diversityScore:    0,
    generationParams: {
      prompt,
      negativePrompt: 'blurry, low quality, distorted, watermark',
      loras:          [],
      aspectRatio:    '16:9',
      steps:          4,
      model:          'sdxl-turbo',
      seed:           null,
    },
    estimatedCost:     0.1,
  };
}

module.exports = { run };
