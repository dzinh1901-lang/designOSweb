'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS v1.1.0 · Cinematographer Agent
//
// Responsibilities:
//  - Consume Director's scene JSON (v1.1.0 enriched)
//  - Build per-shot camera paths from benchmark-calibrated presets
//  - Generate Kling 3.0 camera_control JSON per shot
//  - Output: shot_list, camera_paths, lens_specs, timing
//  - Multi-call sequencing (benchmark: 3×5s concat strategy)
// ══════════════════════════════════════════════════════════

const logger = require('../../shared/utils/logger');
const {
  SHOT_TYPES,
  CAMERA_MOTIONS,
  KLING_OUTPUT_SPECS,
  BENCHMARK_METADATA,
} = require('../../config/cinematic-benchmark');

// ── Kling 3.0 Camera Control parameters ──────────────────
// Values calibrated to match benchmark smooth motion quality
const KLING_CAMERA_CONTROLS = {
  static:        { type: 'simple', horizontal: 0,    vertical: 0,    zoom: -0.05, rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
  micro_push:    { type: 'simple', horizontal: 0,    vertical: 0,    zoom: -0.3,  rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
  dolly_back:    { type: 'simple', horizontal: 0,    vertical: 0,    zoom:  0.4,  rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
  dolly_in:      { type: 'simple', horizontal: 0,    vertical: 0,    zoom: -0.8,  rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
  crane_up:      { type: 'simple', horizontal: 0,    vertical: -1.2, zoom: -0.4,  rotate: 0, pan: 0,   tilt: 4,   roll: 0 },
  crane_down:    { type: 'simple', horizontal: 0,    vertical:  1.2, zoom: -0.3,  rotate: 0, pan: 0,   tilt: -4,  roll: 0 },
  orbit_slow:    { type: 'orbit',  direction: 'clockwise',        speed: 'slow',      altitude: 'mid' },
  parallax:      { type: 'simple', horizontal: 0.3,  vertical: 0,    zoom: -0.1,  rotate: 0, pan: 3,   tilt: 0,   roll: 0 },
  tracking_left: { type: 'simple', horizontal: 1.0,  vertical: 0,    zoom:  0,    rotate: 0, pan: 8,   tilt: 0,   roll: 0 },
  handheld_sub:  { type: 'simple', horizontal: 0.05, vertical: 0.03, zoom: -0.05, rotate: 0.02, pan: 1, tilt: 0.5, roll: 0 },
  // Maritime specific
  mar_ocean_sweep:    { type: 'simple', horizontal: 0.8,  vertical: 0.15, zoom: -0.4,  rotate: 0, pan: 7,   tilt: -2,  roll: 0 },
  mar_vessel_orbit:   { type: 'orbit',  direction: 'counterclockwise',   speed: 'slow',      altitude: 'mid' },
  mar_aerial_track:   { type: 'simple', horizontal: 0,    vertical: -0.4, zoom: -0.25, rotate: 0, pan: 0,   tilt: -4,  roll: 0 },
  // Real estate specific
  cre_aerial_rise:    { type: 'simple', horizontal: 0,    vertical: -1.5, zoom: -0.3,  rotate: 0, pan: 0,   tilt: 5,   roll: 0 },
  cre_facade_dolly:   { type: 'simple', horizontal: 0,    vertical: 0,    zoom: -1.0,  rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
  cre_reveal_pull:    { type: 'simple', horizontal: 0,    vertical: 0,    zoom:  0.5,  rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
  // Luxury branding specific
  lux_micro_inch:     { type: 'simple', horizontal: 0,    vertical: 0,    zoom: -0.15, rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
  lux_product_reveal: { type: 'orbit',  direction: 'clockwise',        speed: 'very_slow', altitude: 'low' },
  lux_portrait_push:  { type: 'simple', horizontal: 0,    vertical: 0,    zoom: -0.5,  rotate: 0, pan: 0,   tilt: 0,   roll: 0 },
};

// ── Lens presets (benchmark-calibrated) ──────────────────
// Benchmark: 1176×784 native, 85mm portrait dominant (seq_01/04), 35mm wide (seq_15)
const LENS_PRESETS = {
  portrait_hero:      { focalMm: 85,  aperture: 'f/1.4', dof: 'extreme_shallow', description: 'Benchmark portrait — SSS + bokeh (seq_01)' },
  portrait_standard:  { focalMm: 85,  aperture: 'f/2.0', dof: 'shallow',         description: 'MCU gesture portrait (seq_04)' },
  standard_hero:      { focalMm: 50,  aperture: 'f/2.8', dof: 'medium',          description: 'Standard hero perspective' },
  product_macro:      { focalMm: 100, aperture: 'f/2.8', dof: 'micro',           description: 'Product/material detail — insert (seq_10)' },
  room_reveal:        { focalMm: 35,  aperture: 'f/5.6', dof: 'moderate',        description: 'Interior reveal / panel shot (seq_13)' },
  architectural_wide: { focalMm: 24,  aperture: 'f/8',   dof: 'deep',           description: 'Full room / god-ray scene (seq_15)' },
  ultra_wide_epic:    { focalMm: 16,  aperture: 'f/11',  dof: 'infinite',        description: 'Epic establishing scale' },
  maritime_wide:      { focalMm: 24,  aperture: 'f/7.1', dof: 'deep',           description: 'Maritime landscape / seascape' },
  telephoto_compress: { focalMm: 135, aperture: 'f/2.0', dof: 'shallow',         description: 'Compressed perspective, luxury isolation' },
};

// ── Run Cinematographer agent ─────────────────────────────
async function run({ jobId, mode, directorResult, metadata = {} }) {
  const start = Date.now();
  logger.info('Cinematographer agent started', { jobId, mode, version: '1.1.0' });

  const { scene } = directorResult;
  const industry  = scene.industry || 'commercial_real_estate';
  const shotSeq   = scene.shot_sequence || [];

  // Build per-shot cinematic specifications
  const cinematicShots = buildCinematicShots(shotSeq, scene, mode, metadata);

  // Build Kling 3.0 call plan (multi-call concat strategy from benchmark)
  const klingCallPlan = buildKlingCallPlan(cinematicShots, scene, mode, metadata);

  // Overall sequence metrics
  const totalDuration = cinematicShots.reduce((sum, s) => sum + s.duration_s, 0);

  const result = {
    agent:       'cinematographer',
    version:     '1.1.0',
    jobId,
    durationMs:  Date.now() - start,
    cinematicShots,
    klingCallPlan,
    aspectRatio: metadata.aspectRatio || KLING_OUTPUT_SPECS.default_ratio,
    frameRate:   KLING_OUTPUT_SPECS.target_fps,
    totalDuration_s: totalDuration,
    outputFormat: {
      codec:      KLING_OUTPUT_SPECS.codec,
      resolution: KLING_OUTPUT_SPECS.native_resolution,
      quality:    mode === 'cinema' ? 'cinema' : 'standard',
    },
    benchmark_reference: {
      file:       BENCHMARK_METADATA.file,
      resolution: BENCHMARK_METADATA.resolution,
      fps:        BENCHMARK_METADATA.fps,
      quality:    BENCHMARK_METADATA.quality_score,
    },
  };

  logger.info('Cinematographer agent complete', {
    jobId,
    shotCount:    cinematicShots.length,
    klingCalls:   klingCallPlan.length,
    totalDuration,
    durationMs:   result.durationMs,
  });

  return result;
}

// ── Build per-shot cinematic specs ─────────────────────────
function buildCinematicShots(shotSeq, scene, mode, metadata) {
  const industry = scene.industry;
  const cinProfile = scene.cinematic_profile || {};

  if (!shotSeq.length) {
    shotSeq = getDefaultShotSequence(industry, mode);
  }

  return shotSeq.map((shot, idx) => {
    const shotTypeDef = SHOT_TYPES[shot.shot_type] || SHOT_TYPES.MS;
    const lensPreset  = resolveLens(shot.shot_type, industry, mode);
    const cameraCtrl  = resolveKlingCameraControl(shot.camera_motion, industry, shot.shot_type);
    const lightingNote = buildLightingNote(shot, scene, cinProfile);
    const qualityHints = buildQualityHints(shot, scene, cinProfile, mode);

    return {
      shot_index:    idx,
      shot_id:       shot.shot_id || `shot_${String(idx + 1).padStart(2, '0')}`,
      shot_type:     shot.shot_type,
      shot_type_def: shotTypeDef,
      focal_mm:      shot.focal_mm || lensPreset.focalMm,
      aperture:      lensPreset.aperture,
      dof:           lensPreset.dof,
      lens_preset:   lensPreset,
      camera_motion: shot.camera_motion || 'static',
      camera_control: cameraCtrl,
      duration_s:    shot.duration_s || 5,
      description:   shot.description,
      kling_prompt:  buildKlingPromptForShot(shot, scene, cinProfile, qualityHints),
      lighting_note: lightingNote,
      quality_hints: qualityHints,
      render_priority: idx === 0 ? 'hero' : idx === shotSeq.length - 1 ? 'outro' : 'standard',
    };
  });
}

// ── Build Kling 3.0 call plan ─────────────────────────────
function buildKlingCallPlan(cinematicShots, scene, mode, metadata) {
  // Benchmark strategy: 3 separate 5s Kling calls → concat
  // Segment shots into ≤5s chunks per API call
  const calls = [];
  let callIndex = 0;
  let currentBatch = [];
  let batchDuration = 0;
  const MAX_CALL_DURATION = KLING_OUTPUT_SPECS.target_duration_s.benchmark / 3; // ~5s

  for (const shot of cinematicShots) {
    if (batchDuration + shot.duration_s > MAX_CALL_DURATION && currentBatch.length > 0) {
      calls.push(buildKlingCall(callIndex++, currentBatch, scene, mode, metadata));
      currentBatch = [];
      batchDuration = 0;
    }
    currentBatch.push(shot);
    batchDuration += shot.duration_s;
  }
  if (currentBatch.length > 0) {
    calls.push(buildKlingCall(callIndex++, currentBatch, scene, mode, metadata));
  }

  return calls;
}

function buildKlingCall(callIndex, shots, scene, mode, metadata) {
  const primaryShot = shots[0];
  const totalDur    = shots.reduce((s, sh) => s + sh.duration_s, 0);
  const cinProfile  = scene.cinematic_profile || {};

  // Consolidated prompt from all shots in batch
  const compositePrompt = shots.map(s => s.kling_prompt).join('. ');

  return {
    call_index:      callIndex,
    call_id:         `kling_call_${String(callIndex).padStart(2, '0')}`,
    model:           'kling-v3',
    mode:            mode === 'cinema' ? 'pro' : 'standard',
    prompt:          compositePrompt,
    negative_prompt: buildNegativePrompt(scene),
    duration_s:      Math.min(totalDur, 10),
    aspect_ratio:    metadata.aspectRatio || KLING_OUTPUT_SPECS.default_ratio,
    fps:             KLING_OUTPUT_SPECS.target_fps,
    camera_control:  primaryShot.camera_control,
    cfg_scale:       mode === 'cinema' ? 0.5 : 0.5, // Kling uses 0-1 scale
    seed:            metadata.seed || null,
    reference_image: metadata.referenceImageUrl || null,
    style_reference: buildStyleReference(cinProfile),
    shots_in_call:   shots.map(s => s.shot_id),
    quality_target:  cinProfile.quality_target || 8.5,
  };
}

// ── Kling prompt builder (benchmark-calibrated) ───────────
function buildKlingPromptForShot(shot, scene, cinProfile, qualityHints) {
  const parts = [];

  // Base shot description from Director
  if (shot.key_kling_prompt) {
    parts.push(shot.key_kling_prompt);
  } else if (shot.description) {
    parts.push(shot.description);
  }

  // Camera motion term
  const motionDef = CAMERA_MOTIONS[shot.camera_motion?.toLowerCase()?.replace(/-/g, '_')] || CAMERA_MOTIONS.STATIC;
  if (motionDef?.prompt_term) parts.push(motionDef.prompt_term);

  // DOF term from benchmark
  const shotTypeDef = SHOT_TYPES[shot.shot_type];
  if (shot.shot_type === 'ECU' || shot.shot_type === 'CU') {
    parts.push('extreme shallow depth of field f/1.4, razor focus eye plane, large circular bokeh');
  } else if (shot.shot_type === 'MCU' || shot.shot_type === 'MS') {
    parts.push('shallow depth of field f/2.0, soft background separation');
  }

  // Color/lighting from benchmark profile
  const colorProfileId = cinProfile.color_profile_id || 'tungsten_warm';
  if (colorProfileId === 'tungsten_warm' || colorProfileId === 'candlelight_film') {
    parts.push('warm amber tungsten lighting 3200K, teal-orange color grade, golden rim light');
  } else if (colorProfileId === 'sacred_volumetric') {
    parts.push('dramatic volumetric god ray light shafts, dust particles in light beam, warm amber interior');
  } else if (colorProfileId === 'maritime_daylight') {
    parts.push('maritime golden hour, atmospheric ocean haze, warm horizon reflection');
  }

  // Quality signals from benchmark
  if (qualityHints.sss) parts.push('subsurface scattering skin, pinkish light transmission, SSS shaders');
  if (qualityHints.hairDetail) parts.push('individual hair strand separation, rim light per-strand specular');
  if (qualityHints.volumetric) parts.push('atmospheric volumetric haze, cinematic smoke');
  if (qualityHints.godRays) parts.push('divine god ray light shafts through window, dust motes in beam');
  if (qualityHints.catchlight) parts.push('teardrop catchlight specular in eye, wet ocular surface');
  if (qualityHints.maritimeReflections) parts.push('physics-accurate ocean water reflections, caustics, maritime LoRA');

  // Universal quality terms
  parts.push('cinematic broadcast quality, photorealistic, 8K render quality');
  parts.push('professional color grading, no grain unless artistic, no watermark');

  return parts.join(', ');
}

function buildQualityHints(shot, scene, cinProfile, mode) {
  return {
    sss:                  (cinProfile.sss_enabled && (shot.shot_type === 'ECU' || shot.shot_type === 'CU' || shot.shot_type === 'MCU')),
    hairDetail:           cinProfile.hair_strand_detail && mode === 'cinema',
    volumetric:           cinProfile.volumetric_light,
    godRays:              cinProfile.god_rays,
    catchlight:           shot.shot_type === 'ECU' && cinProfile.sss_enabled,
    maritimeReflections:  cinProfile.maritime_reflection_lora,
    dustParticles:        cinProfile.dust_particles,
  };
}

function buildLightingNote(shot, scene, cinProfile) {
  const rig = cinProfile.lighting_rig;
  if (!rig) return scene.lighting?.primary || 'cinematic warm';
  return `${rig.name} — key: ${rig.key?.position || 'natural'}, fill: ${rig.fill?.ratio || 'ambient'}, vol: ${rig.volumetric?.enabled ? `${(rig.volumetric.strength * 100).toFixed(0)}%` : 'off'}`;
}

// ── Helpers ───────────────────────────────────────────────
function resolveLens(shotType, industry, mode) {
  // Direct benchmark-calibrated mapping
  const map = {
    ECU:    'portrait_hero',
    CU:     'portrait_hero',
    MCU:    'portrait_standard',
    MS:     industry === 'luxury_branding' ? 'room_reveal' : 'standard_hero',
    MLS:    industry === 'maritime' ? 'maritime_wide' : 'room_reveal',
    LS:     industry === 'maritime' ? 'maritime_wide' : 'architectural_wide',
    XWS:    'ultra_wide_epic',
    INSERT: 'product_macro',
  };
  const key = map[shotType] || 'standard_hero';
  return LENS_PRESETS[key] || LENS_PRESETS.standard_hero;
}

function resolveKlingCameraControl(motionId, industry, shotType) {
  // Industry + shot-type specific overrides
  if (industry === 'maritime') {
    if (motionId === 'tracking_left' || motionId === 'tracking_right') return KLING_CAMERA_CONTROLS.mar_ocean_sweep;
    if (motionId === 'orbit_slow') return KLING_CAMERA_CONTROLS.mar_vessel_orbit;
    if (motionId === 'crane_down') return KLING_CAMERA_CONTROLS.mar_aerial_track;
  }
  if (industry === 'commercial_real_estate') {
    if (motionId === 'crane_up') return KLING_CAMERA_CONTROLS.cre_aerial_rise;
    if (motionId === 'dolly_in') return KLING_CAMERA_CONTROLS.cre_facade_dolly;
    if (motionId === 'dolly_back') return KLING_CAMERA_CONTROLS.cre_reveal_pull;
  }
  if (industry === 'luxury_branding') {
    if (shotType === 'ECU' || shotType === 'CU') return KLING_CAMERA_CONTROLS.lux_portrait_push;
    if (motionId === 'orbit_slow') return KLING_CAMERA_CONTROLS.lux_product_reveal;
    if (motionId === 'micro_push') return KLING_CAMERA_CONTROLS.lux_micro_inch;
  }

  // Generic fallback
  const key = (motionId || 'static').toLowerCase().replace(/-/g, '_');
  return KLING_CAMERA_CONTROLS[key] || KLING_CAMERA_CONTROLS.static;
}

function buildNegativePrompt(scene) {
  const base = [
    'blurry', 'low quality', 'distorted', 'watermark', 'text overlay',
    'flat lighting', 'harsh flash', 'overexposed', 'noise grain excessive',
    'temporal flickering', 'identity drift', 'morphing face', 'wrong proportions',
    'cad render', 'wireframe', 'technical drawing', 'split screen',
  ];
  return [...base, ...(scene.negative_elements || [])].join(', ');
}

function buildStyleReference(cinProfile) {
  // Pass color profile and LUT as style guidance
  return {
    lut:           cinProfile.color_profile?.lut_name || 'DOS_TungstenWarm_v1',
    color_temp_k:  cinProfile.color_profile?.color_temp_k || 3200,
    grade_style:   cinProfile.color_profile?.grade_style || 'teal-orange',
    benchmark_ref: BENCHMARK_METADATA.file,
  };
}

function getDefaultShotSequence(industry, mode) {
  const sequences = {
    commercial_real_estate: [
      { shot_id: 'shot_01', shot_type: 'XWS',  camera_motion: 'crane_up',    duration_s: 5, description: 'Establishing aerial crane', key_kling_prompt: 'slow aerial crane up luxury building golden hour' },
      { shot_id: 'shot_02', shot_type: 'MLS',  camera_motion: 'dolly_in',    duration_s: 5, description: 'Facade approach',           key_kling_prompt: 'cinematic dolly into luxury facade warm amber light' },
      { shot_id: 'shot_03', shot_type: 'MS',   camera_motion: 'static',      duration_s: 5, description: 'Interior panel reveal',     key_kling_prompt: 'luxury interior floating panels god rays dust particles' },
    ],
    maritime: [
      { shot_id: 'shot_01', shot_type: 'XWS',  camera_motion: 'tracking_left', duration_s: 5, description: 'Vessel hero shot',      key_kling_prompt: 'superyacht on golden ocean sunset horizon maritime reflection' },
      { shot_id: 'shot_02', shot_type: 'MS',   camera_motion: 'orbit_slow',    duration_s: 5, description: 'Deck lifestyle',         key_kling_prompt: 'luxury yacht deck sunset lifestyle slow orbit golden light' },
      { shot_id: 'shot_03', shot_type: 'ECU',  camera_motion: 'static',        duration_s: 5, description: 'Detail insert',          key_kling_prompt: 'extreme close up yacht detail teak deck warm rim light' },
    ],
    luxury_branding: [
      { shot_id: 'shot_01', shot_type: 'ECU',  camera_motion: 'micro_push',  duration_s: 5, description: 'Emotional portrait',     key_kling_prompt: 'extreme close up portrait SSS skin golden hour rim f/1.4 85mm teal-orange' },
      { shot_id: 'shot_02', shot_type: 'MCU',  camera_motion: 'static',      duration_s: 5, description: 'Gesture reveal',         key_kling_prompt: 'cinematic MCU talent gesture reveal candlelight dramatic side lighting' },
      { shot_id: 'shot_03', shot_type: 'MS',   camera_motion: 'static',      duration_s: 5, description: 'Product panel reveal',   key_kling_prompt: 'floating product panels triptych dark luxury studio self illuminated' },
    ],
  };
  return sequences[industry] || sequences.commercial_real_estate;
}

module.exports = { run };
