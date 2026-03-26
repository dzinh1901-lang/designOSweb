'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS v1.1.0 · Post-Production LUT Library Service
//
// Manages LUT application, color science transforms,
// and post-FX stack execution.
//
// LUT data derived from benchmark frame analysis:
//  - seq_01 (ECU portrait): tungsten_warm, 8.5/10
//  - seq_04 (MCU gesture):  candlelight_film, 8.0/10
//  - seq_07 (abstract VFX): candlelight_film, 7.5/10
//  - seq_10 (hand insert):  candlelight_film, 8.0/10
//  - seq_13 (panel triptych): tungsten_warm, 8.5/10
//  - seq_15 (god rays):    sacred_volumetric, 9.0/10
// ══════════════════════════════════════════════════════════

const logger = require('../../shared/utils/logger');
const { POST_FX, COLOR_PROFILES, QA_THRESHOLDS } = require('../../config/cinematic-benchmark');

// ── LUT Metadata Registry ─────────────────────────────────
// Cube (33-point 3D LUT) format descriptors
// Actual .cube files are generated/stored in S3 by the orchestrator
const LUT_REGISTRY = Object.freeze({

  // ── Benchmark-derived primary LUTs ──────────────────────
  DOS_TungstenWarm_v1: {
    id:           'DOS_TungstenWarm_v1',
    name:         'DesignOS Tungsten Warm',
    version:      '1.0',
    format:       'cube_33',
    s3_key:       'luts/DOS_TungstenWarm_v1.cube',
    description:  'Primary benchmark grade. Warm amber 3200K, teal-orange split. Benchmark: seq_01/13 (8.5/10).',
    benchmark_frames: ['seq_01', 'seq_13'],
    benchmark_score:  8.5,
    color_temp_k:  3200,
    grade_style:   'teal-orange',
    // Transform coefficients (for software LUT generation)
    transforms: {
      // Highlights: push toward warm cream
      highlights:   { r_bias: +0.06, g_bias: -0.01, b_bias: -0.08 },
      // Midtones: warm amber shift
      midtones:     { r_bias: +0.04, g_bias: +0.01, b_bias: -0.04 },
      // Shadows: near-black with warmth, lifted 0.08
      shadows:      { r_bias: +0.02, g_bias: 0, b_bias: -0.02, lift: 0.08 },
      // Saturation
      sat_skin:     1.15,
      sat_env:      0.90,
      // S-curve
      contrast:     0.85, // 0=flat, 1=high
    },
    recommended_for: ['luxury_branding', 'commercial_real_estate_interior', 'golden_hour'],
    industries:      ['commercial_real_estate', 'luxury_branding'],
  },

  DOS_CandlelightFilm_v1: {
    id:           'DOS_CandlelightFilm_v1',
    name:         'DesignOS Candlelight Film',
    version:      '1.0',
    format:       'cube_33',
    s3_key:       'luts/DOS_CandlelightFilm_v1.cube',
    description:  'Candlelight warm 3000K. High contrast 6:1. Crushed shadows. Benchmark: seq_04/10 (8.0/10).',
    benchmark_frames: ['seq_04', 'seq_10'],
    benchmark_score:  8.0,
    color_temp_k:  3000,
    grade_style:   'amber-monochrome',
    transforms: {
      highlights:   { r_bias: +0.08, g_bias: 0, b_bias: -0.10 },
      midtones:     { r_bias: +0.05, g_bias: 0, b_bias: -0.05 },
      shadows:      { r_bias: +0.01, g_bias: 0, b_bias: 0, lift: 0.05 }, // more crushed
      sat_skin:     1.10,
      sat_env:      0.75,
      contrast:     1.10, // high contrast
    },
    recommended_for: ['dramatic_portrait', 'mystery', 'vfx_energy', 'candlelight'],
    industries:      ['luxury_branding'],
  },

  DOS_SacredVolumetric_v1: {
    id:           'DOS_SacredVolumetric_v1',
    name:         'DesignOS Sacred Volumetric',
    version:      '1.0',
    format:       'cube_33',
    s3_key:       'luts/DOS_SacredVolumetric_v1.cube',
    description:  'Warm amber interior + 4500K shaft. Dark surround, god-ray reveal. Benchmark: seq_15 (9.0/10).',
    benchmark_frames: ['seq_15'],
    benchmark_score:  9.0, // HIGHEST in benchmark
    color_temp_k:  3200,   // ambient
    shaft_temp_k:  4500,   // light shaft
    grade_style:   'warm-neutral-contrast',
    transforms: {
      highlights:   { r_bias: +0.05, g_bias: +0.02, b_bias: -0.03 }, // slightly cooler shaft
      midtones:     { r_bias: +0.04, g_bias: 0, b_bias: -0.03 },
      shadows:      { r_bias: +0.01, g_bias: 0, b_bias: -0.01, lift: 0.03 }, // very dark corners
      sat_skin:     1.00,
      sat_env:      0.95,
      contrast:     1.05,
      volumetric_boost: 0.15, // extra shadow contrast for god rays
    },
    recommended_for: ['architectural_reveal', 'gallery', 'luxury_real_estate', 'superyacht_interior', 'god_rays'],
    industries:      ['commercial_real_estate', 'maritime'],
  },

  DOS_MaritimeDaylight_v1: {
    id:           'DOS_MaritimeDaylight_v1',
    name:         'DesignOS Maritime Daylight',
    version:      '1.0',
    format:       'cube_33',
    s3_key:       'luts/DOS_MaritimeDaylight_v1.cube',
    description:  'Maritime golden hour 5600K. Boosted ocean blues, warm amber horizon, coastal atmosphere.',
    benchmark_frames: [],
    benchmark_score:  8.0,
    color_temp_k:  5600,
    grade_style:   'cool-desaturated',
    transforms: {
      highlights:   { r_bias: +0.02, g_bias: +0.01, b_bias: 0 },     // warm horizon highlight
      midtones:     { r_bias: -0.01, g_bias: +0.02, b_bias: +0.06 }, // boost ocean blues
      shadows:      { r_bias: -0.02, g_bias: 0, b_bias: +0.04, lift: 0.12 }, // open shadows
      sat_skin:     1.05,
      sat_env:      1.20, // boosted environment blues/greens
      contrast:     0.90,
    },
    recommended_for: ['maritime', 'superyacht_exterior', 'coastal', 'ocean_horizon'],
    industries:      ['maritime'],
  },

  DOS_LuxuryNeutral_v1: {
    id:           'DOS_LuxuryNeutral_v1',
    name:         'DesignOS Luxury Neutral',
    version:      '1.0',
    format:       'cube_33',
    s3_key:       'luts/DOS_LuxuryNeutral_v1.cube',
    description:  'Luxury neutral 4800K. Product-forward, clean grade, warm cream highlights, elegant shadows.',
    benchmark_frames: [],
    benchmark_score:  8.5,
    color_temp_k:  4800,
    grade_style:   'neutral-elegant',
    transforms: {
      highlights:   { r_bias: +0.03, g_bias: +0.02, b_bias: -0.01 },
      midtones:     { r_bias: +0.02, g_bias: +0.01, b_bias: -0.01 },
      shadows:      { r_bias: +0.01, g_bias: 0, b_bias: 0, lift: 0.06 },
      sat_skin:     1.08,
      sat_env:      0.85,
      contrast:     0.90,
    },
    recommended_for: ['jewelry', 'watches', 'perfume', 'fashion', 'bespoke'],
    industries:      ['luxury_branding'],
  },
});

// ── Post-FX Stack Builder ─────────────────────────────────
function buildPostFxStack(postProcessingSpec, qualityAudit) {
  const stack = [];

  // 1. LUT application (always first)
  const lutId = postProcessingSpec.lut?.file?.replace('.cube', '') || 'DOS_TungstenWarm_v1';
  const lut   = LUT_REGISTRY[lutId];
  if (lut) {
    stack.push({
      step:       'lut_apply',
      order:      1,
      lut_id:     lutId,
      lut_name:   lut.name,
      s3_key:     lut.s3_key,
      intensity:  postProcessingSpec.lut?.intensity || 1.0,
      description: `Apply ${lut.name} — ${lut.description}`,
    });
  }

  // 2. Bloom
  if (postProcessingSpec.bloom?.enabled) {
    stack.push({
      step:       'bloom',
      order:      2,
      intensity:  postProcessingSpec.bloom.intensity,
      threshold:  postProcessingSpec.bloom.threshold,
      radius_px:  postProcessingSpec.bloom.radius_px || 12,
      description: `Bloom: intensity ${postProcessingSpec.bloom.intensity}`,
    });
  }

  // 3. Depth of Field
  if (postProcessingSpec.dof?.enabled) {
    stack.push({
      step:       'depth_of_field',
      order:      3,
      f_stop:     postProcessingSpec.dof.f_stop,
      focal_mm:   postProcessingSpec.dof.focal_mm,
      focus_plane: postProcessingSpec.dof.focus_plane,
      bokeh_shape: postProcessingSpec.dof.bokeh_shape,
      description: `DOF: f/${postProcessingSpec.dof.f_stop} ${postProcessingSpec.dof.focal_mm}mm`,
    });
  }

  // 4. Volumetric light
  if (postProcessingSpec.volumetric?.enabled) {
    if (postProcessingSpec.volumetric.god_rays) {
      stack.push({
        step:       'god_rays',
        order:      4,
        strength:   postProcessingSpec.volumetric.strength || 0.85,
        dust_particles: postProcessingSpec.volumetric.dust_particles || false,
        light_direction: 'upper_right', // benchmark seq_15
        description: 'God-ray volumetric light shafts with dust particles',
      });
    } else {
      stack.push({
        step:       'volumetric_haze',
        order:      4,
        strength:   postProcessingSpec.volumetric.strength || 0.5,
        description: 'Atmospheric volumetric haze',
      });
    }
  }

  // 5. SSS (if rendering skin)
  if (postProcessingSpec.sss?.enabled) {
    stack.push({
      step:       'subsurface_scattering',
      order:      5,
      strength:   postProcessingSpec.sss.strength || 0.8,
      scatter_color: '#FF9070', // pinkish-warm SSS scatter (benchmark)
      description: 'SSS skin — benchmark seq_01 quality',
    });
  }

  // 6. Vignette
  if (postProcessingSpec.vignette?.enabled) {
    stack.push({
      step:       'vignette',
      order:      6,
      intensity:  postProcessingSpec.vignette.intensity,
      softness:   postProcessingSpec.vignette.softness,
      description: `Vignette: ${Math.round(postProcessingSpec.vignette.intensity * 100)}%`,
    });
  }

  // 7. Film grain (conditional — benchmark was near-zero)
  if (postProcessingSpec.film_grain?.enabled && postProcessingSpec.film_grain?.intensity > 0) {
    stack.push({
      step:       'film_grain',
      order:      7,
      intensity:  postProcessingSpec.film_grain.intensity,
      description: `Film grain: ${postProcessingSpec.film_grain.intensity} (analog warmth)`,
    });
  }

  // 8. Motion blur
  if (postProcessingSpec.motion_blur?.enabled) {
    stack.push({
      step:       'motion_blur',
      order:      8,
      shutter_angle: 180,
      description: '180° shutter angle motion blur (24fps cinematic)',
    });
  }

  // 9. Chromatic aberration (only for maritime exterior)
  if (postProcessingSpec.chromatic_aberration?.enabled) {
    stack.push({
      step:       'chromatic_aberration',
      order:      9,
      intensity:  postProcessingSpec.chromatic_aberration.intensity || 0.15,
      description: 'Subtle chromatic aberration (maritime atmospheric distortion)',
    });
  }

  // 10. Final output encode
  stack.push({
    step:        'encode',
    order:       10,
    codec:       'h264',
    bitrate_mbps: 6.5,
    fps:          24,
    resolution:   '1176x784',
    color_space:  'rec709',
    description:  'Final encode — benchmark spec (6.5Mbps H.264 1176×784 24fps)',
  });

  return stack.sort((a, b) => a.order - b.order);
}

// ── Quality Gate ──────────────────────────────────────────
function runQualityGate(videoMetrics, scene) {
  const issues = [];
  const { clip_similarity_min, temporal_stability_min, benchmark_score_target, auto_reject_below, hitl_review_range, auto_approve_above } = QA_THRESHOLDS;

  if (videoMetrics.clip_similarity < clip_similarity_min) {
    issues.push({ type: 'CLIP_MISMATCH', value: videoMetrics.clip_similarity, threshold: clip_similarity_min });
  }
  if (videoMetrics.temporal_stability < temporal_stability_min) {
    issues.push({ type: 'TEMPORAL_INSTABILITY', value: videoMetrics.temporal_stability, threshold: temporal_stability_min });
  }

  const compositeScore = videoMetrics.composite_score || 7.0;

  let verdict;
  if (compositeScore < auto_reject_below) {
    verdict = 'REJECT';
  } else if (compositeScore < hitl_review_range[1]) {
    verdict = 'HITL_REVIEW';
  } else {
    verdict = 'APPROVE';
  }

  return {
    verdict,
    composite_score: compositeScore,
    benchmark_target: benchmark_score_target,
    issues,
    pass: verdict === 'APPROVE',
    require_hitl: verdict === 'HITL_REVIEW',
    auto_reject:  verdict === 'REJECT',
  };
}

// ── Service API ───────────────────────────────────────────
function getLut(lutId) {
  return LUT_REGISTRY[lutId] || null;
}

function getLutsByIndustry(industry) {
  return Object.values(LUT_REGISTRY)
    .filter(l => l.industries?.includes(industry))
    .sort((a, b) => b.benchmark_score - a.benchmark_score);
}

function getBenchmarkLuts() {
  return Object.values(LUT_REGISTRY)
    .filter(l => l.benchmark_frames?.length > 0)
    .sort((a, b) => b.benchmark_score - a.benchmark_score);
}

function listLuts() {
  return Object.values(LUT_REGISTRY).map(l => ({
    id:              l.id,
    name:            l.name,
    description:     l.description,
    benchmark_score: l.benchmark_score,
    color_temp_k:    l.color_temp_k,
    industries:      l.industries,
  }));
}

module.exports = {
  LUT_REGISTRY,
  buildPostFxStack,
  runQualityGate,
  getLut,
  getLutsByIndustry,
  getBenchmarkLuts,
  listLuts,
};
