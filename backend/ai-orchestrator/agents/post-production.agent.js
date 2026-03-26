'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS · Post-Production Agent (Editor)
//
// Responsibilities:
//  - Apply LUT color grades to rendered video clips
//  - Compile multi-shot sequences
//  - Add motion blur, DOF, film grain, vignette
//  - Apply audio recommendations (Suno v4, ElevenLabs)
//  - Add branding overlays (logo watermark, end card)
//  - Export final deliverable with metadata
//  - Generate thumbnail
// ══════════════════════════════════════════════════════════

const path   = require('path');
const logger = require('../../shared/utils/logger');
const storageService = require('../../services/storage/storage.service');

// Audio mood → Suno v4 style tags mapping
const AUDIO_MOOD_MAP = {
  dramatic:    { sunoTags: 'orchestral, dramatic, epic, cinematic', tempo: 'moderate', bpm: 110 },
  calm:        { sunoTags: 'ambient, calm, minimal, atmospheric',   tempo: 'slow',     bpm: 70  },
  inspiring:   { sunoTags: 'inspiring, uplifting, corporate, piano', tempo: 'moderate', bpm: 95 },
  tense:       { sunoTags: 'tense, suspenseful, strings, buildup',   tempo: 'fast',     bpm: 130 },
  luxurious:   { sunoTags: 'luxury, sophisticated, jazz, lounge',    tempo: 'slow',     bpm: 80  },
  adventurous: { sunoTags: 'adventurous, orchestral, brass, waves',  tempo: 'moderate', bpm: 105 },
};

// Brand overlay presets
const BRAND_OVERLAYS = {
  default: {
    logoPosition:   'bottom-right',
    logoPadding:    40,
    logoScale:      0.12,
    endCardDuration: 3,
    watermarkAlpha: 0.85,
  },
  minimal: {
    logoPosition:   'bottom-right',
    logoPadding:    20,
    logoScale:      0.08,
    endCardDuration: 2,
    watermarkAlpha: 0.6,
  },
  full: {
    logoPosition:   'center',
    logoPadding:    0,
    logoScale:      0.25,
    endCardDuration: 5,
    watermarkAlpha: 1.0,
    showTagline:    true,
    tagline:        '2026 Bluebird. Powered By DesignOS.',
  },
};

// ── Run Post-Production agent ─────────────────────────────
async function run({
  jobId, mode, directorResult, cinematographerResult,
  stylistResult, videoUrls, metadata = {},
}) {
  const start = Date.now();
  logger.info('Post-Production agent started', { jobId, mode, clips: videoUrls?.length });

  const { scene }     = directorResult;
  const { lut }       = stylistResult;
  const { outputFormat, shotList } = cinematographerResult;

  // Build composition plan
  const composition  = buildComposition(scene, videoUrls || [], cinematographerResult);
  const colorGrade   = buildColorGrade(lut, stylistResult.postProcessing, mode);
  const audioSpec    = buildAudioSpec(scene.audio_mood, metadata.durationSeconds || 10, metadata);
  const brandOverlay = buildBrandOverlay(metadata.brandPreset || 'default');
  const exportSpec   = buildExportSpec(mode, metadata);

  // Build complete post spec
  const postSpec = {
    jobId,
    composition,
    colorGrade,
    audioSpec,
    brandOverlay,
    exportSpec,
    thumbnailSpec: buildThumbnailSpec(scene, mode),
  };

  const result = {
    agent:      'post-production',
    jobId,
    durationMs: Date.now() - start,
    postSpec,
    outputSpec: {
      format:   exportSpec.format,
      quality:  exportSpec.quality,
      codec:    exportSpec.codec,
      resolution: exportSpec.resolution,
    },
    audioSpec,
    estimatedRenderTime: estimateRenderTime(mode, videoUrls?.length || 1),
  };

  logger.info('Post-Production agent complete', {
    jobId,
    clips:      composition.clips.length,
    hasAudio:   !!audioSpec.enabled,
    durationMs: result.durationMs,
  });

  return result;
}

// ── Composition plan ───────────────────────────────────────
function buildComposition(scene, videoUrls, cinematographerResult) {
  const { shotPlan } = cinematographerResult;

  const clips = videoUrls.map((url, i) => {
    const shot    = shotPlan?.[i] || { shot: `clip_${i}`, seconds: 5 };
    return {
      clipIndex:    i,
      sourceUrl:    url,
      startSec:     0,
      endSec:       shot.seconds || 5,
      transitionIn: i === 0 ? 'fade_from_black' : 'cross_dissolve',
      transitionOut: i === videoUrls.length - 1 ? 'fade_to_black' : null,
      transitionDuration: 0.8,
      label:        shot.shot || `clip_${i}`,
    };
  });

  return {
    clips,
    totalDuration: clips.reduce((sum, c) => sum + (c.endSec - c.startSec), 0),
    frameRate:     cinematographerResult.frameRate || 24,
    aspectRatio:   cinematographerResult.aspectRatio || '16:9',
  };
}

// ── Color grade spec ───────────────────────────────────────
function buildColorGrade(lut, postProcessing, mode) {
  return {
    lut: {
      file:      lut?.file || 'neutral_grade.cube',
      intensity: mode === 'cinema' ? 1.0 : 0.8,
    },
    adjustments: {
      exposure:    0,
      contrast:    mode === 'cinema' ? 0.1 : 0,
      saturation:  0.05,
      temperature: 0,
      highlights:  mode === 'cinema' ? -0.1 : 0,
      shadows:     mode === 'cinema' ? 0.05 : 0,
    },
    effects: {
      dof: postProcessing?.dof || { enabled: false },
      motionBlur: postProcessing?.motionBlur || { enabled: false },
      bloom:      postProcessing?.bloom || { enabled: false },
      grainAmount: postProcessing?.grainAmount || 0,
      vignette:    postProcessing?.vignette || 0,
    },
  };
}

// ── Audio spec ─────────────────────────────────────────────
function buildAudioSpec(audioMood, duration, metadata) {
  const moodConfig = AUDIO_MOOD_MAP[audioMood] || AUDIO_MOOD_MAP.inspiring;
  const hasCustomAudio = !!metadata.customAudioUrl;

  return {
    enabled:       true,
    source:        hasCustomAudio ? 'custom' : 'suno_v4',
    customUrl:     hasCustomAudio ? metadata.customAudioUrl : null,
    duration,
    fadeIn:        1.5,
    fadeOut:       2.0,
    volume:        0.75,
    // Suno v4 generation spec
    sunoSpec: hasCustomAudio ? null : {
      style:         moodConfig.sunoTags,
      tempo:         moodConfig.tempo,
      targetBpm:     moodConfig.bpm,
      duration:      Math.min(duration + 3, 30), // slight overshoot for fade
      instrumental:  true,
      mood:          audioMood,
    },
    // ElevenLabs voiceover (optional)
    voiceOver: metadata.voiceOverScript ? {
      enabled:   true,
      script:    metadata.voiceOverScript.slice(0, 2000),
      voice:     metadata.voiceId || 'professional_male_uk',
      timing:    'auto',
      volume:    0.9,
    } : { enabled: false },
  };
}

// ── Brand overlay spec ─────────────────────────────────────
function buildBrandOverlay(presetKey) {
  const preset = BRAND_OVERLAYS[presetKey] || BRAND_OVERLAYS.default;
  return {
    ...preset,
    enabled:       true,
    logoUrl:       process.env.BRAND_LOGO_URL || null, // CDN URL
    textOverlays:  [],
  };
}

// ── Export spec ────────────────────────────────────────────
function buildExportSpec(mode, metadata) {
  const resolutionMap = {
    cinema:      { width: 7680, height: 4320, label: '8K' },
    draft:       { width: 1920, height: 1080, label: '1080p' },
    exploration: { width: 1920, height: 1080, label: '1080p' },
  };
  const res = resolutionMap[mode] || resolutionMap.draft;

  return {
    format:     'mp4',
    codec:      mode === 'cinema' ? 'h265' : 'h264',
    quality:    mode === 'cinema' ? 'lossless' : 'high',
    resolution: res,
    bitrate:    mode === 'cinema' ? '80Mbps' : '15Mbps',
    colorSpace: mode === 'cinema' ? 'rec2020' : 'rec709',
    deliverables: [
      { format: 'mp4', quality: 'master', resolution: res },
      { format: 'mp4', quality: 'web',    resolution: { width: 1920, height: 1080, label: '1080p' } },
      { format: 'gif', quality: 'preview', resolution: { width: 640,  height: 360, label: '360p' } },
    ],
  };
}

// ── Thumbnail spec ─────────────────────────────────────────
function buildThumbnailSpec(scene, mode) {
  return {
    extractAtSec:   1.5, // 1.5s into video for thumbnail frame
    overlayText:    null,
    width:          1280,
    height:         720,
    format:         'jpeg',
    quality:        92,
  };
}

// ── Estimate render time ───────────────────────────────────
function estimateRenderTime(mode, clipCount) {
  const baseMs = { cinema: 300_000, draft: 30_000, exploration: 60_000 };
  return (baseMs[mode] || 60_000) * clipCount;
}

module.exports = { run };
