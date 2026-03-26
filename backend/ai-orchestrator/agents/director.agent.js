'use strict';
// ══════════════════════════════════════════════════════════
// DESIGNOS v1.1.0 · Director Agent (Architect)
//
// Responsibilities:
//  - Parse incoming prompt + reference images
//  - Invoke Claude 3.5 Sonnet for structured scene JSON
//  - Output: scene_geometry, camera_metadata, subject_list
//  - Cinematic benchmark calibration (v1.1.0 upgrade)
//  - Industry-aware scene enrichment
//  - Complexity + maritime detection heuristics
// ══════════════════════════════════════════════════════════

const axios  = require('axios');
const logger = require('../../shared/utils/logger');
const {
  COLOR_PROFILES,
  DOF_PRESETS,
  LIGHTING_RIGS,
  KLING_OUTPUT_SPECS,
  QA_THRESHOLDS,
  BENCHMARK_METADATA,
} = require('../../config/cinematic-benchmark');

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_KEY  = () => process.env.ANTHROPIC_API_KEY;
const MODEL          = 'claude-3-5-sonnet-20241022';

// ── Claude call helper ────────────────────────────────────
async function callClaude(systemPrompt, userMessage, maxTokens = 3072) {
  if (!ANTHROPIC_KEY()) {
    logger.warn('Director: ANTHROPIC_API_KEY not set — using mock scene');
    return null; // triggers fallback path
  }

  const resp = await axios.post(
    `${ANTHROPIC_BASE}/messages`,
    {
      model:      MODEL,
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    },
    {
      headers: {
        'x-api-key':         ANTHROPIC_KEY(),
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      timeout: 45_000,
    }
  );

  const content = resp.data?.content?.[0]?.text || '';
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                    content.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error('Director: Claude did not return valid JSON');
  return JSON.parse(jsonMatch[1]);
}

// ── System prompt (v1.1.0 — benchmark-calibrated) ─────────
const DIRECTOR_SYSTEM = `You are the Director agent for DesignOS v1.1.0, an Autonomous Cinematic Generation Engine.

TARGET QUALITY LEVEL: Match or exceed the benchmark Kling 3.0 output (composite score 8.5/10).
Benchmark quality signals (in priority order):
1. Subsurface scattering (SSS) on skin/organic surfaces — pinkish light transmission
2. Hair strand detail with rim light separation
3. Volumetric atmosphere — haze, god rays, dust particles in light
4. Coherent catchlights in eyes (teardrop wetness simulation)
5. Narrative continuity across shots — no subject identity drift
6. Consistent color grading — single warm-amber LUT maintained
7. Smooth camera motion — no motion artifacts

COLOR SCIENCE FROM BENCHMARK:
- Primary grade: Teal-Orange, ~3200K warm tungsten base
- Highlights: warm amber #F5DEC0 / #C47A3A
- Shadows: near-black with slight warmth #0A0808
- Skin: boosted saturation ×1.15, SSS bias pink-warm
- Env: slightly desaturated (0.90) to push foreground subject

INDUSTRIES & SPECIFIC REQUIREMENTS:
- commercial_real_estate: Golden hour reveals, sacred god-ray volumetrics (benchmark seq_15), floating product panels, luxury interiors with SSS materials
- maritime: Sunset-on-water golden light, maritime reflection LoRA, coastal atmosphere, superyacht lifestyle (talent + vessel)
- luxury_branding: Extreme close-up emotional portraits (benchmark seq_01), bespoke configuration panels (seq_13), product-reveal magical touch (seq_10), perfume/jewelry S-curve grade

Return ONLY valid JSON inside \`\`\`json\`\`\` fences with this exact schema:
{
  "scene_title": "string",
  "industry": "commercial_real_estate | maritime | luxury_branding | other",
  "cinematic_profile": {
    "quality_target": 8.5,
    "color_profile_id": "tungsten_warm | candlelight_film | sacred_volumetric | maritime_daylight | luxury_neutral",
    "lighting_rig_id": "golden_hour_rim | candlelight_dramatic | magical_practical | sacred_god_rays | panel_triptych | maritime_sunset",
    "dof_preset_id": "portrait_extreme | portrait_soft | environmental | deep_focus | product_hero",
    "post_fx_id": "benchmark_standard | luxury_premium | maritime_exterior | architectural_reveal",
    "sss_enabled": true,
    "hair_strand_detail": true,
    "volumetric_light": false,
    "god_rays": false,
    "dust_particles": false,
    "maritime_reflection_lora": false
  },
  "shot_sequence": [
    {
      "shot_id": "shot_01",
      "shot_type": "ECU | CU | MCU | MS | MLS | LS | INSERT",
      "focal_mm": 85,
      "camera_motion": "static | micro_push | dolly_back | dolly_in | crane_up | crane_down | orbit_slow | parallax | tracking_left | handheld_sub",
      "duration_s": 5,
      "description": "string",
      "key_kling_prompt": "string — concise Kling 3.0 prompt for this shot"
    }
  ],
  "subjects": [
    { "id": "string", "type": "building | vessel | product | landscape | talent | interior | vfx_element", "description": "string", "position": "foreground | midground | background", "sss_material": false }
  ],
  "environment": {
    "setting": "string",
    "time_of_day": "dawn | morning | midday | afternoon | golden_hour | dusk | night",
    "weather": "clear | overcast | dramatic | storm | fog | rain",
    "season": "spring | summer | autumn | winter | tropical",
    "atmosphere": "string",
    "interior_exterior": "interior | exterior | both"
  },
  "lighting": {
    "primary": "string",
    "secondary": "string | null",
    "hdri_suggestion": "string",
    "lut_preset": "string",
    "color_temp_k": 3200,
    "volumetric_strength": 0.0
  },
  "materials": [
    { "surface": "string", "finish": "string", "texture": "string", "sss": false }
  ],
  "dominant_colors": ["hex"],
  "scene_complexity": 5,
  "special_requirements": ["string"],
  "negative_elements": ["string"],
  "audio_mood": "dramatic | calm | inspiring | tense | luxurious | adventurous",
  "multi_call_strategy": "single | sequential_concat",
  "estimated_render_calls": 1
}`;

// ── Run Director agent ────────────────────────────────────
async function run({ jobId, prompt, mode, referenceImageUrls = [], industry, stylePresets = [], metadata = {} }) {
  const start = Date.now();
  logger.info('Director agent started', { jobId, mode, industry, version: '1.1.0' });

  try {
    const userMessage = buildUserMessage(prompt, referenceImageUrls, industry, stylePresets, metadata);
    const rawScene    = await callClaude(DIRECTOR_SYSTEM, userMessage, 3072);
    const sceneInput  = rawScene || generateMockScene(prompt, industry);

    // Normalise + inject benchmark calibration
    const scene = normaliseScene(sceneInput, { prompt, industry, mode });

    const result = {
      agent:      'director',
      version:    '1.1.0',
      jobId,
      durationMs: Date.now() - start,
      scene,
      rawPrompt:  prompt,
      references: referenceImageUrls,
      benchmark:  {
        target_score:   QA_THRESHOLDS.benchmark_score_target,
        reference_file: BENCHMARK_METADATA.file,
        output_specs:   KLING_OUTPUT_SPECS,
      },
    };

    logger.info('Director agent complete', {
      jobId,
      sceneTitle:     scene.scene_title,
      complexity:     scene.scene_complexity,
      colorProfile:   scene.cinematic_profile?.color_profile_id,
      lightingRig:    scene.cinematic_profile?.lighting_rig_id,
      shotCount:      scene.shot_sequence?.length,
      durationMs:     result.durationMs,
    });

    return result;

  } catch (err) {
    logger.error('Director agent failed', { jobId, error: err.message });
    const fallback = generateMockScene(prompt, industry);
    return {
      agent:      'director',
      version:    '1.1.0',
      jobId,
      durationMs: Date.now() - start,
      scene:      normaliseScene(fallback, { prompt, industry, mode }),
      rawPrompt:  prompt,
      references: referenceImageUrls,
      fallback:   true,
      error:      err.message,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────
function buildUserMessage(prompt, imageUrls, industry, stylePresets, metadata) {
  let msg = `Transform this into a benchmark-quality cinematic scene (target score: ≥8.0/10):\n\n`;
  msg += `PROMPT: "${prompt}"\n`;
  msg += `INDUSTRY: ${industry || 'unspecified'}\n`;
  if (imageUrls.length) {
    msg += `REFERENCE IMAGES: ${imageUrls.length} provided (${imageUrls.slice(0, 3).join(', ')})\n`;
  }
  if (stylePresets?.length) {
    msg += `STYLE PRESETS: ${stylePresets.join(', ')}\n`;
  }
  if (metadata.renderMode) {
    msg += `RENDER MODE: ${metadata.renderMode} — `;
    if (metadata.renderMode === 'cinema') msg += 'Use Flux.1 + Kling 3.0, maximum quality, full benchmark parameters.\n';
    if (metadata.renderMode === 'draft')  msg += 'SDXL rapid preview, simplified scene acceptable.\n';
    if (metadata.renderMode === 'explore') msg += 'Genspark AI creative expansion, multiple variations.\n';
  }
  // Inject industry-specific context
  const industryHint = INDUSTRY_HINTS[industry] || '';
  if (industryHint) msg += `\nINDUSTRY CONTEXT: ${industryHint}\n`;
  msg += `\nReturn the structured scene JSON.`;
  return msg;
}

const INDUSTRY_HINTS = {
  commercial_real_estate:
    'Focus on dramatic architectural reveals with sacred god-ray volumetrics (benchmark seq_15). ' +
    'Use deep focus (f/7.1) to capture full building scale. Warm amber LUT (3200K). ' +
    'Include floating floor-plan/material panels if interior. Camera: slow crane-up or dolly-back reveal.',
  maritime:
    'Prioritise maritime reflection LoRA for accurate water caustics. ' +
    'Sunset golden hour on open water with atmospheric horizon haze. ' +
    'Include superyacht hull materials (reflective gelcoat, teak deck). ' +
    'Lifestyle talent: shallow DOF 85mm portrait against water background. ' +
    'Camera: slow orbit or tracking shot following vessel.',
  luxury_branding:
    'Extreme close-up emotional portraits with SSS skin rendering (benchmark seq_01, 8.5/10). ' +
    'Self-illuminated product/bespoke panel reveals (benchmark seq_13, 8.5/10). ' +
    'Magical touch/reveal device for product activation (benchmark seq_10, 8.0/10). ' +
    'Teal-orange LUT with crushed shadows. f/1.4 portrait lens. Hair rim separation critical.',
};

function normaliseScene(raw, { prompt, industry, mode }) {
  // Resolve color profile
  const colorProfileId = raw.cinematic_profile?.color_profile_id
    || resolveColorProfile(industry);
  const colorProfile = COLOR_PROFILES[colorProfileId.toUpperCase().replace(/-/g, '_')]
    || COLOR_PROFILES.TUNGSTEN_WARM;

  // Resolve lighting rig
  const lightingRigId = raw.cinematic_profile?.lighting_rig_id
    || resolveLightingRig(industry, raw.environment?.time_of_day);
  const lightingRig = LIGHTING_RIGS[lightingRigId.toUpperCase().replace(/-/g, '_')]
    || LIGHTING_RIGS.GOLDEN_HOUR_RIM;

  // Resolve DOF
  const dofPresetId = raw.cinematic_profile?.dof_preset_id
    || resolveDofPreset(mode, raw.shot_sequence?.[0]?.shot_type);
  const dofPreset = DOF_PRESETS[dofPresetId.toUpperCase().replace(/-/g, '_')]
    || DOF_PRESETS.PORTRAIT_SOFT;

  // Build shot sequence (minimum 1 shot)
  const shotSequence = buildShotSequence(raw.shot_sequence, industry, mode);

  return {
    scene_title:     raw.scene_title       || extractTitle(prompt),
    industry:        raw.industry          || industry || 'other',
    cinematic_profile: {
      quality_target:          raw.cinematic_profile?.quality_target ?? 8.5,
      color_profile_id:        colorProfileId,
      color_profile:           colorProfile,
      lighting_rig_id:         lightingRigId,
      lighting_rig:            lightingRig,
      dof_preset_id:           dofPresetId,
      dof_preset:              dofPreset,
      post_fx_id:              raw.cinematic_profile?.post_fx_id || resolvePostFx(industry),
      sss_enabled:             raw.cinematic_profile?.sss_enabled          ?? (industry === 'luxury_branding'),
      hair_strand_detail:      raw.cinematic_profile?.hair_strand_detail   ?? true,
      volumetric_light:        raw.cinematic_profile?.volumetric_light     ?? (industry === 'commercial_real_estate'),
      god_rays:                raw.cinematic_profile?.god_rays             ?? (industry === 'commercial_real_estate'),
      dust_particles:          raw.cinematic_profile?.dust_particles       ?? false,
      maritime_reflection_lora: raw.cinematic_profile?.maritime_reflection_lora ?? (industry === 'maritime'),
    },
    shot_sequence:   shotSequence,
    subjects:        Array.isArray(raw.subjects)  ? raw.subjects  : defaultSubjects(industry),
    environment:     raw.environment              || defaultEnvironment(industry),
    lighting:        mergeLighting(raw.lighting, lightingRig, colorProfile),
    materials:       Array.isArray(raw.materials) ? raw.materials : defaultMaterials(industry),
    dominant_colors: Array.isArray(raw.dominant_colors) ? raw.dominant_colors : colorProfile.dominant_palette,
    scene_complexity: Math.min(10, Math.max(1, raw.scene_complexity || 6)),
    special_requirements: buildSpecialRequirements(raw.special_requirements, industry, lightingRig),
    negative_elements: raw.negative_elements || DEFAULT_NEGATIVES,
    audio_mood:        raw.audio_mood        || resolveAudioMood(industry),
    multi_call_strategy: raw.multi_call_strategy || 'sequential_concat',
    estimated_render_calls: raw.estimated_render_calls || Math.ceil(shotSequence.reduce((acc, s) => acc + (s.duration_s || 5), 0) / 5),
    _calibration_version: '1.1.0',
  };
}

function buildShotSequence(rawShots, industry, mode) {
  if (Array.isArray(rawShots) && rawShots.length > 0) {
    return rawShots.map((s, i) => ({
      shot_id:       s.shot_id     || `shot_${String(i + 1).padStart(2, '0')}`,
      shot_type:     s.shot_type   || 'MS',
      focal_mm:      s.focal_mm    || 50,
      camera_motion: s.camera_motion || 'static',
      duration_s:    s.duration_s  || 5,
      description:   s.description || '',
      key_kling_prompt: s.key_kling_prompt || s.description || '',
    }));
  }
  // Generate default shot sequence by industry
  return DEFAULT_SHOT_SEQUENCES[industry] || DEFAULT_SHOT_SEQUENCES.other;
}

const DEFAULT_SHOT_SEQUENCES = {
  commercial_real_estate: [
    { shot_id: 'shot_01', shot_type: 'XWS',    focal_mm: 24,  camera_motion: 'crane_up',   duration_s: 5,
      description: 'Aerial establishing — full building scale', key_kling_prompt: 'slow crane upward reveal luxury building, golden hour, volumetric god rays, sacred light shafts, deep focus' },
    { shot_id: 'shot_02', shot_type: 'MLS',    focal_mm: 35,  camera_motion: 'dolly_in',   duration_s: 5,
      description: 'Facade approach — architectural detail', key_kling_prompt: 'slow cinematic dolly into luxury facade, warm amber light, deep shadows, architectural grandeur' },
    { shot_id: 'shot_03', shot_type: 'MS',     focal_mm: 35,  camera_motion: 'static',     duration_s: 5,
      description: 'Interior reveal — floating art panels with god rays', key_kling_prompt: 'luxury interior with floating illuminated panels, dramatic volumetric light shafts, dust particles in light, dark warm amber walls' },
  ],
  maritime: [
    { shot_id: 'shot_01', shot_type: 'XWS',    focal_mm: 24,  camera_motion: 'tracking_left', duration_s: 5,
      description: 'Vessel hero shot — golden ocean horizon', key_kling_prompt: 'superyacht on golden ocean, sunset horizon, atmospheric haze, maritime reflection LoRA, warm amber grade' },
    { shot_id: 'shot_02', shot_type: 'MS',     focal_mm: 50,  camera_motion: 'orbit_slow',  duration_s: 5,
      description: 'Deck lifestyle — talent at stern', key_kling_prompt: 'slow orbit luxury yacht deck, lifestyle talent in white, golden sunset behind, shallow depth of field 85mm' },
    { shot_id: 'shot_03', shot_type: 'ECU',    focal_mm: 85,  camera_motion: 'static',      duration_s: 5,
      description: 'Detail hero — helm or material detail', key_kling_prompt: 'extreme close up yacht detail teak deck helm, warm rim light, f1.4 bokeh, subsurface material scatter' },
  ],
  luxury_branding: [
    { shot_id: 'shot_01', shot_type: 'ECU',    focal_mm: 85,  camera_motion: 'micro_push',  duration_s: 5,
      description: 'Emotional portrait — SSS skin hero', key_kling_prompt: 'extreme close up emotional portrait, golden hour rim light, subsurface scattering skin, f1.4 85mm, teal-orange LUT, catchlight eyes' },
    { shot_id: 'shot_02', shot_type: 'MCU',    focal_mm: 85,  camera_motion: 'static',      duration_s: 5,
      description: 'Gesture reveal — pointing or unveiling', key_kling_prompt: 'cinematic MCU talent gesture reveal, dramatic side lighting, candlelight warm, shallow DOF, white elegant garment' },
    { shot_id: 'shot_03', shot_type: 'MS',     focal_mm: 35,  camera_motion: 'static',      duration_s: 5,
      description: 'Bespoke panel reveal — triptych floating product', key_kling_prompt: 'floating illuminated product panels triptych, dark luxury studio, self-illuminated panels, warm amber background, deep shadow' },
  ],
  other: [
    { shot_id: 'shot_01', shot_type: 'LS',     focal_mm: 35,  camera_motion: 'dolly_in',    duration_s: 5,
      description: 'Establishing shot', key_kling_prompt: 'cinematic establishing shot, warm golden lighting, atmospheric depth, broadcast quality' },
    { shot_id: 'shot_02', shot_type: 'MS',     focal_mm: 50,  camera_motion: 'static',      duration_s: 5,
      description: 'Subject hero shot', key_kling_prompt: 'cinematic medium shot hero subject, dramatic lighting, warm grade, film quality' },
  ],
};

function resolveColorProfile(industry) {
  const map = {
    commercial_real_estate: 'sacred_volumetric',
    maritime:               'maritime_daylight',
    luxury_branding:        'tungsten_warm',
  };
  return map[industry] || 'tungsten_warm';
}

function resolveLightingRig(industry, timeOfDay) {
  if (industry === 'maritime') return 'maritime_sunset';
  if (industry === 'commercial_real_estate') return 'sacred_god_rays';
  if (industry === 'luxury_branding') {
    return timeOfDay === 'night' ? 'candlelight_dramatic' : 'golden_hour_rim';
  }
  return 'golden_hour_rim';
}

function resolveDofPreset(mode, firstShotType) {
  if (firstShotType === 'ECU' || firstShotType === 'CU') return 'portrait_extreme';
  if (mode === 'cinema') return 'portrait_soft';
  if (firstShotType === 'MLS' || firstShotType === 'LS') return 'environmental';
  return 'portrait_soft';
}

function resolvePostFx(industry) {
  const map = {
    commercial_real_estate: 'architectural_reveal',
    maritime:               'maritime_exterior',
    luxury_branding:        'luxury_premium',
  };
  return map[industry] || 'benchmark_standard';
}

function resolveAudioMood(industry) {
  const map = {
    commercial_real_estate: 'inspiring',
    maritime:               'adventurous',
    luxury_branding:        'luxurious',
  };
  return map[industry] || 'inspiring';
}

function mergeLighting(rawLighting, rig, colorProfile) {
  return {
    primary:             rawLighting?.primary     || rig.name || 'cinematic warm',
    secondary:           rawLighting?.secondary   || null,
    hdri_suggestion:     rawLighting?.hdri_suggestion || resolveHdri(rig.id),
    lut_preset:          rawLighting?.lut_preset  || colorProfile.lut_name,
    color_temp_k:        rawLighting?.color_temp_k || colorProfile.color_temp_k,
    volumetric_strength: rig.volumetric?.strength || 0,
    rig:                 rig,
  };
}

function resolveHdri(rigId) {
  const map = {
    golden_hour_rim:       'golden_hour_urban_4k',
    candlelight_dramatic:  'warm_interior_4k',
    magical_practical:     'dark_studio_4k',
    sacred_god_rays:       'luxury_interior_shafts_4k',
    panel_triptych:        'dark_studio_4k',
    maritime_sunset:       'coastal_sunset_4k',
  };
  return map[rigId] || 'golden_hour_urban_4k';
}

function buildSpecialRequirements(rawReqs, industry, rig) {
  const reqs = Array.isArray(rawReqs) ? [...rawReqs] : [];
  if (industry === 'maritime' && !reqs.includes('maritime-reflection-lora')) {
    reqs.push('maritime-reflection-lora');
  }
  if (rig?.volumetric?.enabled && !reqs.includes('volumetric-light')) {
    reqs.push('volumetric-light');
  }
  if (rig?.volumetric?.dust_particles) reqs.push('dust-particle-scatter');
  return reqs;
}

function defaultSubjects(industry) {
  const map = {
    commercial_real_estate: [{ id: 'subj_1', type: 'building',  description: 'Luxury high-rise or villa', position: 'midground', sss_material: false }],
    maritime:               [{ id: 'subj_1', type: 'vessel',    description: 'Superyacht or motor vessel', position: 'midground', sss_material: false }],
    luxury_branding:        [{ id: 'subj_1', type: 'talent',    description: 'Luxury brand ambassador',    position: 'foreground', sss_material: true }],
  };
  return map[industry] || [{ id: 'subj_1', type: 'landscape', description: 'Scene subject', position: 'midground', sss_material: false }];
}

function defaultEnvironment(industry) {
  const base = { time_of_day: 'golden_hour', weather: 'clear', season: 'summer' };
  const map = {
    commercial_real_estate: { ...base, setting: 'luxury_building_exterior',   atmosphere: 'prestigious and aspirational', interior_exterior: 'exterior' },
    maritime:               { ...base, setting: 'open_ocean_coastal',          atmosphere: 'adventurous and exclusive',     interior_exterior: 'exterior' },
    luxury_branding:        { ...base, setting: 'luxury_studio_or_interior',   atmosphere: 'intimate and exclusive',        interior_exterior: 'interior' },
  };
  return map[industry] || { ...base, setting: 'exterior', atmosphere: 'prestigious', interior_exterior: 'exterior' };
}

function defaultMaterials(industry) {
  const map = {
    commercial_real_estate: [
      { surface: 'glass_facade', finish: 'reflective_tinted', texture: 'smooth', sss: false },
      { surface: 'stone_cladding', finish: 'polished', texture: 'travertine', sss: false },
    ],
    maritime: [
      { surface: 'yacht_hull', finish: 'glossy_white_gelcoat', texture: 'smooth', sss: false },
      { surface: 'teak_deck', finish: 'oiled_natural', texture: 'wood_grain', sss: false },
    ],
    luxury_branding: [
      { surface: 'skin', finish: 'subsurface_scattering', texture: 'pore_detail', sss: true },
      { surface: 'fabric', finish: 'silk_satin', texture: 'weave_microdetail', sss: false },
    ],
  };
  return map[industry] || [{ surface: 'generic', finish: 'matte', texture: 'smooth', sss: false }];
}

const DEFAULT_NEGATIVES = [
  'blurry', 'distorted', 'watermark', 'low quality', 'flat lighting',
  'overexposed', 'noise', 'artifacting', 'temporal flickering',
  'identity drift', 'cad render', 'wireframe', 'technical drawing',
];

function extractTitle(prompt) {
  const words = (prompt || '').trim().split(/\s+/).slice(0, 6).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function generateMockScene(prompt, industry) {
  const isMaritime = /ocean|sea|yacht|vessel|marine|maritime|boat/i.test(prompt);
  const isLuxury   = /luxury|fashion|brand|product|perfume|jewel|watch/i.test(prompt);
  const isRealty   = /building|tower|penthouse|apartment|villa|estate|real.?estate/i.test(prompt);
  const resolvedInd = isMaritime ? 'maritime'
    : isLuxury   ? 'luxury_branding'
    : isRealty   ? 'commercial_real_estate'
    : (industry  || 'commercial_real_estate');

  return {
    scene_title: extractTitle(prompt),
    industry:    resolvedInd,
    cinematic_profile: {
      quality_target:          8.5,
      color_profile_id:        resolveColorProfile(resolvedInd),
      lighting_rig_id:         resolveLightingRig(resolvedInd, 'golden_hour'),
      dof_preset_id:           resolveDofPreset('cinema', 'MS'),
      post_fx_id:              resolvePostFx(resolvedInd),
      sss_enabled:             resolvedInd === 'luxury_branding',
      hair_strand_detail:      true,
      volumetric_light:        resolvedInd === 'commercial_real_estate',
      god_rays:                resolvedInd === 'commercial_real_estate',
      dust_particles:          resolvedInd === 'commercial_real_estate',
      maritime_reflection_lora: resolvedInd === 'maritime',
    },
    shot_sequence:       DEFAULT_SHOT_SEQUENCES[resolvedInd] || DEFAULT_SHOT_SEQUENCES.other,
    subjects:            defaultSubjects(resolvedInd),
    environment:         defaultEnvironment(resolvedInd),
    lighting: {
      primary:           'golden hour cinematic',
      secondary:         null,
      hdri_suggestion:   resolveHdri(resolveLightingRig(resolvedInd, 'golden_hour')),
      lut_preset:        COLOR_PROFILES[resolveColorProfile(resolvedInd).toUpperCase().replace(/-/g, '_')]?.lut_name || 'DOS_TungstenWarm_v1',
      color_temp_k:      3200,
      volumetric_strength: resolvedInd === 'commercial_real_estate' ? 0.85 : 0.3,
    },
    materials:           defaultMaterials(resolvedInd),
    dominant_colors:     COLOR_PROFILES[resolveColorProfile(resolvedInd).toUpperCase().replace(/-/g, '_')]?.dominant_palette || ['#C47A3A', '#E8A882', '#F5DEC0'],
    scene_complexity:    6,
    special_requirements: buildSpecialRequirements([], resolvedInd, LIGHTING_RIGS[resolveLightingRig(resolvedInd, 'golden_hour').toUpperCase().replace(/-/g, '_')]),
    negative_elements:   DEFAULT_NEGATIVES,
    audio_mood:          resolveAudioMood(resolvedInd),
    multi_call_strategy: 'sequential_concat',
    estimated_render_calls: 3,
    _calibration_version: '1.1.0',
  };
}

module.exports = { run };
