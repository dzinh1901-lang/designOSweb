'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS v1.1.0 · Visual Stylist Agent (Lighting Lead)
//
// Responsibilities:
//  - Select HDRI environment maps
//  - Assign LUT color grades (benchmark-calibrated)
//  - Define PBR material properties + SSS settings
//  - Build Flux.1 / SDXL diffusion parameters
//  - Set Pinecone style embedding anchors
//  - Maritime LoRA + luxury LoRA integration
//  - Post-production FX stack from benchmark analysis
// ══════════════════════════════════════════════════════════

const logger = require('../../shared/utils/logger');
const {
  COLOR_PROFILES,
  POST_FX,
  LIGHTING_RIGS,
  DOF_PRESETS,
  QUALITY_SIGNALS,
  BENCHMARK_METADATA,
} = require('../../config/cinematic-benchmark');

// ── HDRI Library (benchmark-calibrated) ──────────────────
// Matched to benchmark seq_15 god-ray interior, seq_01 golden-hour portrait
const HDRI_LIBRARY = {
  // Benchmark-matched HDRIs
  golden_hour_urban_4k:         { file: 'golden_hour_urban_4k.hdr',         intensity: 1.2, rotation: 45,  temp_k: 3500, description: 'Warm golden city horizon — matches seq_01 portrait lighting' },
  luxury_interior_shafts_4k:    { file: 'luxury_interior_shafts_4k.hdr',    intensity: 0.7, rotation: 270, temp_k: 3200, description: 'Interior warm with god-ray shafts — matches seq_15' },
  warm_interior_4k:             { file: 'warm_interior_candlelight_4k.hdr', intensity: 0.8, rotation: 0,   temp_k: 3000, description: 'Candlelight warm interior — matches seq_04/10' },
  dark_studio_4k:               { file: 'dark_studio_low_key_4k.hdr',       intensity: 0.5, rotation: 0,   temp_k: 3200, description: 'Dark studio — matches seq_07/10 magical VFX' },
  coastal_sunset_4k:            { file: 'coastal_sunset_ocean_4k.hdr',      intensity: 1.3, rotation: 45,  temp_k: 3400, description: 'Maritime sunset — golden horizon on water' },
  // Supporting HDRIs
  overcast_soft_4k:             { file: 'overcast_diffuse_4k.hdr',          intensity: 0.9, rotation: 0,   temp_k: 6500, description: 'Soft diffuse overcast' },
  midday_clear_4k:              { file: 'midday_clear_sun_4k.hdr',          intensity: 1.5, rotation: 90,  temp_k: 5600, description: 'High sun clear sky' },
  dawn_coastal_4k:              { file: 'dawn_coastal_fog_4k.hdr',          intensity: 0.7, rotation: 270, temp_k: 4000, description: 'Dawn coastal atmosphere' },
  dramatic_storm_4k:            { file: 'storm_dramatic_4k.hdr',            intensity: 1.4, rotation: 180, temp_k: 5000, description: 'Dramatic storm clouds' },
  night_urban_4k:               { file: 'night_urban_neon_4k.hdr',          intensity: 0.5, rotation: 90,  temp_k: 3800, description: 'Night urban warm ambient' },
  blue_hour_4k:                 { file: 'blue_hour_cityscape_4k.hdr',       intensity: 0.65, rotation: 45, temp_k: 7500, description: 'Blue hour twilight' },
};

// ── LUT Library (benchmark-derived) ──────────────────────
// Benchmark color science: teal-orange, ~3200K, warm-amber highlights,
// near-black shadow lift 0.05–0.08, saturation skin 1.15
const LUT_LIBRARY = {
  // Primary benchmark LUTs
  DOS_TungstenWarm_v1:      { file: 'DOS_TungstenWarm_v1.cube',       description: 'Primary benchmark grade — warm amber 3200K, teal-orange split, skin sat 1.15', benchmark_frame: 'seq_01', quality: 8.5 },
  DOS_CandlelightFilm_v1:   { file: 'DOS_CandlelightFilm_v1.cube',    description: 'Candlelight film — 3000K, high contrast 6:1 fill, crushed blacks',             benchmark_frame: 'seq_04/10', quality: 8.0 },
  DOS_SacredVolumetric_v1:  { file: 'DOS_SacredVolumetric_v1.cube',   description: 'Sacred god-ray — warm ambient + 4500K shaft, dark surround, dust particles',   benchmark_frame: 'seq_15', quality: 9.0 },
  DOS_MaritimeDaylight_v1:  { file: 'DOS_MaritimeDaylight_v1.cube',   description: 'Maritime daylight — 5600K, boosted blues, ocean-ready',                        benchmark_frame: null, quality: 8.0 },
  DOS_LuxuryNeutral_v1:     { file: 'DOS_LuxuryNeutral_v1.cube',      description: 'Luxury neutral — 4800K, product-forward, clean grade',                         benchmark_frame: null, quality: 8.5 },
  // Legacy / fallback
  warm_cinematic:           { file: 'warm_cinematic_legacy.cube',     description: 'Legacy warm grade' },
  cool_editorial:           { file: 'cool_editorial_legacy.cube',     description: 'Cool editorial grade' },
  maritime_blue:            { file: 'maritime_blue_legacy.cube',      description: 'Maritime teal grade' },
  luxury_noir:              { file: 'luxury_noir_legacy.cube',        description: 'High contrast deep black' },
};

// ── LoRA Registry ─────────────────────────────────────────
const LORA_REGISTRY = {
  'maritime-water-reflection-v2': {
    trigger_words: ['ocean surface', 'wave physics', 'maritime water', 'coastal reflection'],
    strength:      0.85,
    description:   'Physics-accurate water — caustics, ocean reflections, maritime realism',
    benchmark_note: 'Required for maritime industry — temporal stability risk without it',
  },
  'luxury-interior-sss-v1': {
    trigger_words: ['luxury interior', 'subsurface skin', 'premium finishes', 'warm interior light'],
    strength:      0.75,
    description:   'Luxury interior + SSS skin rendering — maps to seq_01/04 benchmark quality',
  },
  'glass-facade-cre-v2': {
    trigger_words: ['glass curtain wall', 'high rise facade', 'architectural glass', 'tower facade'],
    strength:      0.80,
    description:   'Architectural glass + steel for commercial real estate reveals',
  },
  'luxury-editorial-v2': {
    trigger_words: ['editorial photography', 'luxury branding', 'fashion cinematography', 'brand film'],
    strength:      0.80,
    description:   'Editorial luxury — maps to seq_01 portrait quality standard',
  },
  'volumetric-god-rays-v1': {
    trigger_words: ['god rays', 'light shafts', 'volumetric light', 'dust in light'],
    strength:      0.70,
    description:   'Volumetric light shafts with dust particles — maps to seq_15 benchmark (9.0/10)',
  },
  'magical-vfx-energy-v1': {
    trigger_words: ['magical energy', 'light trace', 'energy discharge', 'particle sparks'],
    strength:      0.75,
    description:   'Self-illuminated energy VFX + particle scatter — maps to seq_07/10',
  },
};

// ── Run Visual Stylist agent ──────────────────────────────
async function run({ jobId, mode, directorResult, cinematographerResult, metadata = {} }) {
  const start = Date.now();
  logger.info('Visual Stylist agent started', { jobId, mode, version: '1.1.0' });

  const { scene } = directorResult;
  const cinProfile = scene.cinematic_profile || {};

  const hdri        = selectHDRI(scene, cinProfile);
  const lut         = selectLUT(scene, mode, cinProfile);
  const loras       = selectLoRAs(scene, cinProfile, metadata);
  const materials   = buildMaterials(scene, cinProfile);
  const diffParams  = buildDiffusionParams(scene, mode, metadata, loras, cinProfile);
  const styleEmbeds = buildStyleEmbeds(scene, mode, cinProfile);
  const postFx      = buildPostProcessing(scene, mode, cinProfile);
  const qualityAudit = auditQualitySignals(scene, cinProfile, mode);

  const result = {
    agent:           'visual-stylist',
    version:         '1.1.0',
    jobId,
    durationMs:      Date.now() - start,
    hdri,
    lut,
    loras,
    materials,
    diffusionParams: diffParams,
    styleEmbeds,
    postProcessing:  postFx,
    qualityAudit,
    colorScience: {
      profile:       cinProfile.color_profile_id,
      lut_name:      lut.key,
      color_temp_k:  cinProfile.color_profile?.color_temp_k || 3200,
      grade_style:   cinProfile.color_profile?.grade_style  || 'teal-orange',
      dominant_colors: scene.dominant_colors || cinProfile.color_profile?.dominant_palette,
    },
  };

  logger.info('Visual Stylist agent complete', {
    jobId,
    hdri:         hdri.key,
    lut:          lut.key,
    loraCount:    loras.length,
    qualityScore: qualityAudit.predicted_score,
    durationMs:   result.durationMs,
  });

  return result;
}

// ── HDRI selection ─────────────────────────────────────────
function selectHDRI(scene, cinProfile) {
  // Check Director's suggestion first
  const suggestedKey = scene.lighting?.hdri_suggestion;
  if (suggestedKey && HDRI_LIBRARY[suggestedKey]) {
    return { key: suggestedKey, ...HDRI_LIBRARY[suggestedKey] };
  }

  // Derive from cinematic profile
  const key = deriveHDRI(scene, cinProfile);
  return { key, ...HDRI_LIBRARY[key] };
}

function deriveHDRI(scene, cinProfile) {
  const industry = scene.industry;
  const tod      = scene.environment?.time_of_day;
  const rigId    = cinProfile.lighting_rig_id;

  // Rig-based mapping (most specific)
  const rigMap = {
    sacred_god_rays:       'luxury_interior_shafts_4k',
    panel_triptych:        'dark_studio_4k',
    magical_practical:     'dark_studio_4k',
    candlelight_dramatic:  'warm_interior_4k',
    golden_hour_rim:       'golden_hour_urban_4k',
    maritime_sunset:       'coastal_sunset_4k',
  };
  if (rigId && rigMap[rigId]) return rigMap[rigId];

  // Industry + time-of-day fallback
  if (industry === 'maritime') {
    if (tod === 'golden_hour' || tod === 'dusk') return 'coastal_sunset_4k';
    if (tod === 'dawn') return 'dawn_coastal_4k';
    return 'midday_clear_4k';
  }
  if (industry === 'luxury_branding') {
    if (tod === 'night') return 'warm_interior_4k';
    return 'dark_studio_4k';
  }
  // CRE
  if (tod === 'golden_hour') return 'golden_hour_urban_4k';
  if (tod === 'night') return 'night_urban_4k';
  if (tod === 'dusk') return 'blue_hour_4k';
  if (tod === 'dawn') return 'dawn_coastal_4k';
  if (scene.environment?.weather === 'overcast') return 'overcast_soft_4k';
  return 'midday_clear_4k';
}

// ── LUT selection ──────────────────────────────────────────
function selectLUT(scene, mode, cinProfile) {
  // Director-specified LUT
  const dirLut = scene.lighting?.lut_preset || cinProfile.color_profile?.lut_name;
  if (dirLut && LUT_LIBRARY[dirLut]) {
    return { key: dirLut, ...LUT_LIBRARY[dirLut] };
  }

  // Benchmark-calibrated defaults by color profile
  const profileMap = {
    tungsten_warm:      'DOS_TungstenWarm_v1',
    candlelight_film:   'DOS_CandlelightFilm_v1',
    sacred_volumetric:  'DOS_SacredVolumetric_v1',
    maritime_daylight:  'DOS_MaritimeDaylight_v1',
    luxury_neutral:     'DOS_LuxuryNeutral_v1',
  };
  const profileId = cinProfile.color_profile_id;
  if (profileId && profileMap[profileId]) {
    const key = profileMap[profileId];
    return { key, ...LUT_LIBRARY[key] };
  }

  // Final fallback by industry
  const industryMap = {
    maritime:               'DOS_MaritimeDaylight_v1',
    luxury_branding:        'DOS_TungstenWarm_v1',
    commercial_real_estate: 'DOS_SacredVolumetric_v1',
  };
  const key = industryMap[scene.industry] || 'DOS_TungstenWarm_v1';
  return { key, ...LUT_LIBRARY[key] };
}

// ── LoRA selection ─────────────────────────────────────────
function selectLoRAs(scene, cinProfile, metadata) {
  const selected = [];

  // Maritime water reflections — always for maritime
  if (cinProfile.maritime_reflection_lora || scene.industry === 'maritime') {
    selected.push({ id: 'maritime-water-reflection-v2', ...LORA_REGISTRY['maritime-water-reflection-v2'] });
  }

  // God-ray volumetrics
  if (cinProfile.god_rays || cinProfile.volumetric_light) {
    selected.push({ id: 'volumetric-god-rays-v1', ...LORA_REGISTRY['volumetric-god-rays-v1'] });
  }

  // CRE glass facade
  if (scene.industry === 'commercial_real_estate' &&
      scene.materials?.some(m => m.surface?.includes('glass'))) {
    selected.push({ id: 'glass-facade-cre-v2', ...LORA_REGISTRY['glass-facade-cre-v2'] });
  }

  // Luxury SSS portrait
  if (cinProfile.sss_enabled || scene.industry === 'luxury_branding') {
    selected.push({ id: 'luxury-editorial-v2', ...LORA_REGISTRY['luxury-editorial-v2'] });
    if (cinProfile.sss_enabled) {
      selected.push({ id: 'luxury-interior-sss-v1', ...LORA_REGISTRY['luxury-interior-sss-v1'] });
    }
  }

  // VFX magical energy (special requirements)
  if (scene.special_requirements?.some(r => r.includes('vfx') || r.includes('magical') || r.includes('energy'))) {
    selected.push({ id: 'magical-vfx-energy-v1', ...LORA_REGISTRY['magical-vfx-energy-v1'] });
  }

  // User override
  if (metadata.lora && LORA_REGISTRY[metadata.lora]) {
    if (!selected.find(l => l.id === metadata.lora)) {
      selected.push({ id: metadata.lora, ...LORA_REGISTRY[metadata.lora] });
    }
  }

  return selected;
}

// ── Material properties (PBR + SSS) ───────────────────────
function buildMaterials(scene, cinProfile) {
  const sssEnabled = cinProfile.sss_enabled;

  // Base materials by industry
  const base = getBaseMaterials(scene.industry, sssEnabled);

  // Override with scene-specific materials from Director
  const sceneMats = (scene.materials || []).map(m => buildPBRMaterial(m, sssEnabled));

  return deduplicateMaterials([...base, ...sceneMats]);
}

function getBaseMaterials(industry, sssEnabled) {
  if (industry === 'maritime') return [
    { id: 'ocean_water',    albedo: [0.03, 0.06, 0.10], metallic: 0.9, roughness: 0.03, ior: 1.33, transmission: 0.7, caustics: true,  desc: 'Ocean water surface — physics-accurate' },
    { id: 'yacht_gelcoat',  albedo: [0.92, 0.92, 0.93], metallic: 0.0, roughness: 0.04, ior: 1.50, sss: false,      desc: 'Glossy white yacht hull gelcoat' },
    { id: 'teak_deck',      albedo: [0.48, 0.32, 0.16], metallic: 0.0, roughness: 0.45, sss: false,                desc: 'Teak deck — oiled natural' },
    { id: 'stainless_steel',albedo: [0.78, 0.77, 0.75], metallic: 1.0, roughness: 0.15,                            desc: 'Marine stainless deck hardware' },
  ];
  if (industry === 'luxury_branding') return [
    { id: 'sss_skin',       albedo: [0.76, 0.57, 0.43], metallic: 0.0, roughness: 0.45, sss: sssEnabled, sss_radius: [0.012, 0.006, 0.003], sss_scale: 0.8, desc: 'SSS skin — benchmark seq_01 quality' },
    { id: 'hair_strand',    albedo: [0.20, 0.12, 0.06], metallic: 0.0, roughness: 0.30, anisotropy: 0.85, desc: 'Hair strand — anisotropic per-strand specular' },
    { id: 'silk_fabric',    albedo: [0.92, 0.90, 0.88], metallic: 0.0, roughness: 0.10, sheen: 0.8,      desc: 'Silk/satin garment fabric — seq_04' },
    { id: 'polished_metal', albedo: [0.85, 0.80, 0.70], metallic: 1.0, roughness: 0.05,                  desc: 'Gold/platinum luxury object material' },
  ];
  // CRE default
  return [
    { id: 'architectural_glass', albedo: [0.95, 0.95, 0.98], metallic: 0.0, roughness: 0.02, ior: 1.52, transmission: 0.85, desc: 'Curtain wall glass facade' },
    { id: 'stone_cladding',      albedo: [0.68, 0.62, 0.54], metallic: 0.0, roughness: 0.70,            desc: 'Travertine/limestone cladding' },
    { id: 'interior_oak',        albedo: [0.52, 0.38, 0.24], metallic: 0.0, roughness: 0.50,            desc: 'Luxury interior oak paneling' },
    { id: 'polished_concrete',   albedo: [0.55, 0.55, 0.56], metallic: 0.0, roughness: 0.35,            desc: 'Polished architectural concrete' },
  ];
}

function buildPBRMaterial(m, sssEnabled) {
  const roughnessMap = { reflective: 0.02, polished: 0.05, satin: 0.15, matte: 0.85, rough: 0.90 };
  const metallicMap  = { metal: 1.0, steel: 1.0, chrome: 1.0, copper: 1.0, gold: 1.0 };
  return {
    id:       m.surface,
    albedo:   [0.7, 0.65, 0.6],
    metallic: metallicMap[m.surface?.toLowerCase()] || 0.0,
    roughness: roughnessMap[m.finish?.toLowerCase()] || 0.45,
    sss:      sssEnabled && m.sss,
    desc:     `${m.surface} — ${m.finish}`,
  };
}

function deduplicateMaterials(mats) {
  const seen = new Set();
  return mats.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// ── Diffusion parameters ───────────────────────────────────
function buildDiffusionParams(scene, mode, metadata, loras, cinProfile) {
  const colorProfile = cinProfile.color_profile || COLOR_PROFILES.TUNGSTEN_WARM;

  const negativePrompt = [
    'blurry', 'low quality', 'distorted', 'watermark', 'text',
    'flat lighting', 'harsh shadows', 'overexposed', 'film grain excessive',
    'temporal flickering', 'identity drift', 'morphing', 'wrong anatomy',
    'cad render', 'wireframe', 'plastic look', 'amateur photography',
    ...(scene.negative_elements || []),
  ].join(', ');

  const base = {
    negativePrompt,
    seed:        metadata.seed || null,
    aspectRatio: metadata.aspectRatio || '3:2', // benchmark native
    loras:       loras.map(l => ({ id: l.id, strength: l.strength || 0.75 })),
    colorCorrection: {
      colorTemp_k:   colorProfile.color_temp_k,
      saturationSkin: colorProfile.saturation_skin || 1.0,
      saturationEnv:  colorProfile.saturation_env  || 1.0,
      shadowLift:     colorProfile.shadow_lift      || 0.06,
      highlightRolloff: colorProfile.highlight_rolloff || 0.85,
    },
  };

  if (mode === 'draft') {
    return {
      ...base,
      model:         'sdxl-turbo',
      steps:         4,
      guidance:      0.0,
      scheduler:     'DDIM',
      outputFormat:  'jpeg',
      outputQuality: 80,
    };
  }

  // Cinema → Flux.1 Pro (keyframe generation)
  return {
    ...base,
    model:         'flux-1-pro',
    steps:         50,
    guidance:      3.5,
    scheduler:     'DPM++ 2M Karras',
    outputFormat:  'png',
    outputQuality: 100,
    colorSpace:    'rec709', // match Kling output
    bitDepth:      16,
    upscaler:      mode === 'cinema' ? 'real-esrgan-x4' : null,
    esrganStrength: mode === 'cinema' ? 0.75 : null,
  };
}

// ── Style embedding anchors ────────────────────────────────
function buildStyleEmbeds(scene, mode, cinProfile) {
  const colorProfile = cinProfile.color_profile || COLOR_PROFILES.TUNGSTEN_WARM;
  const embeds = [];

  // Color palette anchor
  if (colorProfile.dominant_palette?.length) {
    embeds.push({
      type:    'color_palette',
      values:  colorProfile.dominant_palette,
      weight:  0.8,
      source:  `benchmark_${BENCHMARK_METADATA.file}`,
    });
  }

  // Style anchor prompt
  embeds.push({
    type:   'style_anchor',
    prompt: buildStyleAnchorPrompt(scene, mode, cinProfile),
    weight: 0.75,
  });

  // Negative style anchor
  embeds.push({
    type:   'negative_style',
    prompt: 'amateur photography, phone camera, flat lighting, stock photo, over-processed, HDR tone-mapped',
    weight: 0.6,
  });

  return embeds;
}

function buildStyleAnchorPrompt(scene, mode, cinProfile) {
  const parts = [];
  const colorProfile = cinProfile.color_profile || COLOR_PROFILES.TUNGSTEN_WARM;

  // Industry base
  const industryStyle = {
    commercial_real_estate: 'luxury architectural photography, prestigious commercial real estate',
    maritime:               'superyacht maritime photography, coastal luxury lifestyle',
    luxury_branding:        'luxury editorial brand film, fashion cinematography',
  };
  parts.push(industryStyle[scene.industry] || 'luxury commercial photography');

  // Color science terms
  parts.push(`${colorProfile.color_temp_k}K warm tungsten lighting`);
  parts.push(`${colorProfile.grade_style} color grade`);

  // Benchmark quality descriptors
  if (mode === 'cinema') {
    parts.push('cinematic broadcast quality', 'subsurface scattering', 'volumetric depth', '8K render quality');
  }
  parts.push('professional commercial production');

  return parts.join(', ');
}

// ── Post-production FX stack ──────────────────────────────
function buildPostProcessing(scene, mode, cinProfile) {
  const postFxId     = cinProfile.post_fx_id || 'benchmark_standard';
  const postFxPreset = POST_FX[postFxId.toUpperCase().replace(/-/g, '_')] || POST_FX.BENCHMARK_STANDARD;
  const dofPreset    = cinProfile.dof_preset || DOF_PRESETS.PORTRAIT_SOFT;

  return {
    preset_id:    postFxId,
    preset_name:  postFxPreset.name,

    dof: {
      enabled:    mode === 'cinema',
      f_stop:     dofPreset.f_stop || 2.0,
      focal_mm:   dofPreset.focal_mm || 85,
      focus_plane: dofPreset.focus_plane || 'subject',
      bokeh_shape: dofPreset.bokeh_shape || 'circular_smooth',
    },

    bloom: {
      enabled:    postFxPreset.bloom.enabled && mode === 'cinema',
      intensity:  postFxPreset.bloom.intensity,
      threshold:  postFxPreset.bloom.threshold,
      radius_px:  postFxPreset.bloom.radius,
    },

    film_grain: {
      enabled:    postFxPreset.film_grain?.enabled && mode !== 'draft',
      intensity:  postFxPreset.film_grain?.intensity || 0.0,
      // Benchmark note: benchmark video had near-zero grain — keep clean
    },

    vignette: {
      enabled:    postFxPreset.vignette?.enabled,
      intensity:  postFxPreset.vignette?.intensity || 0.5,
      softness:   postFxPreset.vignette?.softness  || 0.7,
    },

    motion_blur: {
      enabled:     postFxPreset.motion_blur?.enabled && mode === 'cinema',
      shutter_angle: 180,
    },

    chromatic_aberration: {
      enabled:    postFxPreset.chromatic_ab?.enabled || false,
      intensity:  postFxPreset.chromatic_ab?.intensity || 0.0,
      // Benchmark note: absent in benchmark — only use for maritime exterior
    },

    volumetric: {
      enabled:        cinProfile.volumetric_light || false,
      god_rays:       cinProfile.god_rays || false,
      dust_particles: cinProfile.dust_particles || false,
      strength:       cinProfile.lighting_rig?.volumetric?.strength || 0,
    },

    sss: {
      enabled:  cinProfile.sss_enabled || false,
      strength: 0.8,
      // Benchmark: SSS is the #1 quality signal — weight 0.20
    },

    lut: {
      file:      scene.lighting?.lut_preset || cinProfile.color_profile?.lut_name || 'DOS_TungstenWarm_v1',
      intensity: 1.0, // full LUT application
    },

    audio_post: {
      suno_v4:      true,
      mood:         scene.audio_mood || 'inspiring',
      elevenlabs:   scene.industry === 'luxury_branding', // voiceover for luxury brand films
    },

    quality_targets: {
      clip_similarity_min: 0.72,
      temporal_stability:  0.88,
      benchmark_target:    8.0,
    },
  };
}

// ── Quality signals audit ──────────────────────────────────
function auditQualitySignals(scene, cinProfile, mode) {
  const scores = {};
  let totalWeight = 0;
  let weightedScore = 0;

  for (const signal of QUALITY_SIGNALS) {
    const active = checkSignal(signal.signal, scene, cinProfile, mode);
    scores[signal.signal] = { active, weight: signal.weight, description: signal.description };
    if (active) {
      weightedScore += signal.weight * 10; // 10 = max per signal
    }
    totalWeight += signal.weight;
  }

  const predicted_score = Number((weightedScore / totalWeight).toFixed(1));

  return {
    signals:         scores,
    predicted_score,
    benchmark_target: 8.0,
    pass:            predicted_score >= 7.5,
    gaps:            Object.entries(scores)
                       .filter(([, v]) => !v.active)
                       .map(([k]) => k),
  };
}

function checkSignal(signal, scene, cinProfile, mode) {
  switch (signal) {
    case 'subsurface_scattering':    return cinProfile.sss_enabled === true;
    case 'hair_rim_strand_sep':      return cinProfile.hair_strand_detail && mode === 'cinema';
    case 'volumetric_atmosphere':    return cinProfile.volumetric_light || cinProfile.god_rays;
    case 'catchlight_quality':       return cinProfile.sss_enabled && scene.industry === 'luxury_branding';
    case 'narrative_coherence':      return Array.isArray(scene.shot_sequence) && scene.shot_sequence.length >= 2;
    case 'color_grade_consistency':  return !!cinProfile.color_profile_id;
    case 'camera_motion_smoothness': return mode === 'cinema';
    case 'temporal_stability':       return mode !== 'draft';
    default:                         return false;
  }
}

module.exports = { run };
