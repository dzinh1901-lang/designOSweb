'use strict';
// ══════════════════════════════════════════════════════════════
// DESIGNOS v1.1.0 · Cinematic Quality Profile
//
// Derived from benchmark analysis of production Kling 3.0 output:
//   File: hf_20260322_125816_20ff0c8a-d727-498c-8c3f-339cc029f344.mp4
//   Specs: 1176×784 · 24fps · 15.04s · 6.46Mbps · H.264 Main
//   6 key frames analysed: seq_01, seq_04, seq_07, seq_10, seq_13, seq_15
//
// These constants calibrate all agents and the prompt-builder to
// match or exceed the quality level demonstrated in the benchmark.
// ══════════════════════════════════════════════════════════════

const BENCHMARK_METADATA = Object.freeze({
  file:        'hf_20260322_125816',
  resolution:  { width: 1176, height: 784, ratio: '3:2' },
  fps:         24,
  duration_s:  15.04,
  frames:      361,
  bitrate_kbps: 6458,
  codec:       'h264-main',
  color_space: 'yuv420p-8bit',
  has_audio:   false,
  quality_score: 8.5, // composite from 6-frame analysis
});

// ── Color Science ─────────────────────────────────────────────
const COLOR_PROFILES = Object.freeze({

  // Primary benchmark grade — warm amber-tungsten cinematic
  TUNGSTEN_WARM: {
    id:               'tungsten_warm',
    name:             'Tungsten Warm',
    color_temp_k:     3200,
    dominant_palette: ['#C47A3A', '#E8A882', '#F5DEC0', '#4A2510', '#7A4A20'],
    grade_style:      'teal-orange',
    shadow_lift:      0.08,   // 0=crushed blacks, 1=lifted
    highlight_rolloff: 0.85,  // bloom point
    saturation_skin:  1.15,
    saturation_env:   0.90,
    split_highlights: '#F5DEC0',  // warm cream highlights
    split_shadows:    '#0A0808',  // near-black with slight warmth
    lut_name:         'DOS_TungstenWarm_v1',
    recommended_for:  ['luxury_interior', 'golden_hour', 'fireplace', 'candlelight'],
  },

  // Candlelight variant (slightly cooler, higher contrast)
  CANDLELIGHT_FILM: {
    id:               'candlelight_film',
    name:             'Candlelight Film',
    color_temp_k:     3000,
    dominant_palette: ['#6B3D18', '#C47020', '#FFFFFF', '#3A2010'],
    grade_style:      'amber-monochrome',
    shadow_lift:      0.05,
    highlight_rolloff: 0.92,
    saturation_skin:  1.10,
    saturation_env:   0.75,
    split_highlights: '#F5E0B0',
    split_shadows:    '#0D0906',
    lut_name:         'DOS_CandlelightFilm_v1',
    recommended_for:  ['dark_moody', 'intimate', 'mystery', 'magical_vfx'],
  },

  // Sacred light / volumetric shafts variant
  SACRED_VOLUMETRIC: {
    id:               'sacred_volumetric',
    name:             'Sacred Volumetric',
    color_temp_k:     3200, // warm ambient + 4500K shaft
    dominant_palette: ['#8B5A20', '#F5E0B0', '#F8F5F0', '#9AA0C0'],
    grade_style:      'warm-neutral-contrast',
    shadow_lift:      0.03,
    highlight_rolloff: 0.88,
    saturation_skin:  1.00,
    saturation_env:   0.95,
    split_highlights: '#F5E0B0',
    split_shadows:    '#120B05',
    lut_name:         'DOS_SacredVolumetric_v1',
    recommended_for:  ['architectural_reveal', 'gallery', 'luxury_real_estate', 'superyacht_interior'],
    volumetric_strength: 0.85,
    dust_particles:   true,
  },

  // Cool neutral (maritime daylight / exterior)
  MARITIME_DAYLIGHT: {
    id:               'maritime_daylight',
    name:             'Maritime Daylight',
    color_temp_k:     5600,
    dominant_palette: ['#B8D4E8', '#7AA8C8', '#F0F4F8', '#2A4A6A', '#E8D4A0'],
    grade_style:      'cool-desaturated',
    shadow_lift:      0.12,
    highlight_rolloff: 0.80,
    saturation_skin:  1.05,
    saturation_env:   1.20, // boosted sky/water blues
    split_highlights: '#E8F0F8',
    split_shadows:    '#0A1218',
    lut_name:         'DOS_MaritimeDaylight_v1',
    recommended_for:  ['maritime', 'superyacht_exterior', 'coastal', 'ocean'],
    maritime_reflection_lora: true,
  },

  // Luxury brand neutral (clean, product-forward)
  LUXURY_NEUTRAL: {
    id:               'luxury_neutral',
    name:             'Luxury Neutral',
    color_temp_k:     4800,
    dominant_palette: ['#F5F0EA', '#2A2520', '#C8A870', '#8A7A60'],
    grade_style:      'neutral-elegant',
    shadow_lift:      0.06,
    highlight_rolloff: 0.82,
    saturation_skin:  1.08,
    saturation_env:   0.85,
    split_highlights: '#F8F5F0',
    split_shadows:    '#100E0C',
    lut_name:         'DOS_LuxuryNeutral_v1',
    recommended_for:  ['jewelry', 'watches', 'perfume', 'fashion', 'bespoke'],
  },
});

// ── Depth of Field Presets ─────────────────────────────────────
const DOF_PRESETS = Object.freeze({
  PORTRAIT_EXTREME: {
    id:        'portrait_extreme',
    f_stop:     1.4,
    focal_mm:   85,
    focus_plane: 'eye_plane',
    bokeh_shape: 'circular_smooth',
    bokeh_size:  'large',
    falloff:     'rapid',   // sharp-to-blur in <10% frame distance
    quality:     9.0,
    use_for:     ['hero_talent', 'emotional_close_up', 'luxury_brand_hero'],
  },
  PORTRAIT_SOFT: {
    id:        'portrait_soft',
    f_stop:     2.0,
    focal_mm:   85,
    focus_plane: 'face_profile',
    bokeh_shape: 'circular_smooth',
    bokeh_size:  'medium',
    falloff:     'gradual',
    quality:     8.0,
    use_for:     ['lifestyle', 'gesture', 'interview_style'],
  },
  ENVIRONMENTAL: {
    id:        'environmental',
    f_stop:     4.0,
    focal_mm:   35,
    focus_plane: 'subject_and_near_background',
    bokeh_shape: 'circular',
    bokeh_size:  'small',
    falloff:     'moderate',
    quality:     7.5,
    use_for:     ['establishing', 'location', 'architectural'],
  },
  DEEP_FOCUS: {
    id:        'deep_focus',
    f_stop:     7.1,
    focal_mm:   24,
    focus_plane: 'full_scene',
    bokeh_shape: null,
    bokeh_size:  null,
    falloff:     'atmospheric_haze_only',
    quality:     7.0,
    use_for:     ['architectural_reveal', 'product_scene', 'sacred_volumetric'],
  },
  PRODUCT_HERO: {
    id:        'product_hero',
    f_stop:     2.8,
    focal_mm:   100,
    focus_plane: 'product_surface',
    bokeh_shape: 'circular_smooth',
    bokeh_size:  'medium_large',
    falloff:     'gradual',
    quality:     8.5,
    use_for:     ['jewelry', 'watch', 'luxury_object', 'material_detail'],
  },
});

// ── Lighting Rig Library ──────────────────────────────────────
const LIGHTING_RIGS = Object.freeze({
  GOLDEN_HOUR_RIM: {
    id:          'golden_hour_rim',
    name:        'Golden Hour Rim Portrait',
    key:         { position: '10_oclock_upper_left', size: 'large_soft', temp_k: 4000 },
    fill:        { ratio: '4:1', source: 'ambient_bounce' },
    rim:         { position: 'upper_right_back', temp_k: 3200, intensity: 'strong', color: '#C87A20' },
    volumetric:  { enabled: true, strength: 0.3, type: 'atmospheric_haze' },
    catchlights: true,
    sss_boost:   0.2,
    benchmark_frame: 'seq_01',
    quality_score:   8.5,
    recommended_for: ['luxury_talent', 'hero_portrait', 'golden_hour', 'warm_interior'],
  },
  CANDLELIGHT_DRAMATIC: {
    id:          'candlelight_dramatic',
    name:        'Candlelight Dramatic Side',
    key:         { position: 'camera_right_strong', size: 'medium', temp_k: 3000 },
    fill:        { ratio: '6:1', source: 'minimal_ambient' },
    rim:         { position: 'upper_right_back', temp_k: 3200, intensity: 'subtle' },
    volumetric:  { enabled: false },
    sss_boost:   0.25,
    benchmark_frame: 'seq_04',
    quality_score:   8.0,
    recommended_for: ['intimate', 'dramatic_portrait', 'mystery', 'luxury_interior'],
  },
  MAGICAL_PRACTICAL: {
    id:          'magical_practical',
    name:        'Magical Self-Illuminated Practical',
    key:         { position: 'self_illuminated_vfx', size: 'point_source', temp_k: 6500 },
    fill:        { ratio: '0:1', source: 'none' },
    rim:         null,
    volumetric:  { enabled: true, strength: 0.9, type: 'particle_scatter', color: '#E8F0FF' },
    sss_boost:   0.35,
    benchmark_frame: 'seq_10',
    quality_score:   8.0,
    recommended_for: ['vfx', 'product_reveal', 'tech_demo', 'smart_home', 'navigation_hologram'],
  },
  SACRED_GOD_RAYS: {
    id:          'sacred_god_rays',
    name:        'Sacred God Ray Volumetric',
    key:         { position: 'upper_right_window', size: 'large_shaft', temp_k: 4500 },
    fill:        { ratio: '10:1', source: 'ambient_warm_floor' },
    rim:         null,
    volumetric:  { enabled: true, strength: 1.0, type: 'god_rays_dust', density: 0.4 },
    sss_boost:   0.0,
    benchmark_frame: 'seq_15',
    quality_score:   9.0,
    recommended_for: ['luxury_real_estate', 'penthouse', 'gallery', 'superyacht_interior', 'art_reveal'],
  },
  PANEL_TRIPTYCH: {
    id:          'panel_triptych',
    name:        'Self-Illuminated Panel Triptych',
    key:         { position: 'panels_self_illuminated', size: 'area_rect', temp_k: 5500 },
    fill:        { ratio: '8:1', source: 'panel_bounce' },
    rim:         { position: 'upper_rear', temp_k: 3200, intensity: 'subtle' },
    volumetric:  { enabled: true, strength: 0.4, type: 'panel_bloom_haze' },
    sss_boost:   0.15,
    benchmark_frame: 'seq_13',
    quality_score:   8.5,
    recommended_for: ['product_lineup', 'configuration_selection', 'bespoke_options', 'yacht_interior_configurator'],
  },
  MARITIME_SUNSET: {
    id:          'maritime_sunset',
    name:        'Maritime Sunset Exterior',
    key:         { position: 'low_horizon_golden', size: 'large_natural', temp_k: 3500 },
    fill:        { ratio: '3:1', source: 'sky_bounce' },
    rim:         { position: 'sky_above', temp_k: 7000, intensity: 'moderate', color: '#A8C8E8' },
    volumetric:  { enabled: true, strength: 0.5, type: 'atmospheric_haze_horizon' },
    reflection_lora: 'maritime_water_reflection_v2',
    sss_boost:   0.10,
    benchmark_frame: null,
    quality_score:   8.0,
    recommended_for: ['maritime', 'superyacht_exterior', 'coastal_real_estate', 'port'],
  },
});

// ── Shot Type Library ─────────────────────────────────────────
const SHOT_TYPES = Object.freeze({
  ECU: { name: 'Extreme Close-Up', focal_range_mm: [85, 135], usage: 'eye/feature detail, emotional peak', benchmark_frames: ['seq_01'] },
  CU:  { name: 'Close-Up',         focal_range_mm: [50, 85],  usage: 'face/hand/object hero',             benchmark_frames: ['seq_10'] },
  MCU: { name: 'Medium Close-Up',  focal_range_mm: [50, 85],  usage: 'shoulder-up, gesture, interview',   benchmark_frames: ['seq_04'] },
  MS:  { name: 'Medium Shot',      focal_range_mm: [35, 50],  usage: 'full torso, interaction',            benchmark_frames: ['seq_13'] },
  MLS: { name: 'Medium Long Shot', focal_range_mm: [24, 35],  usage: 'environment + subject, reveal',      benchmark_frames: ['seq_15'] },
  LS:  { name: 'Long Shot',        focal_range_mm: [18, 35],  usage: 'full body, location establish' },
  XWS: { name: 'Extreme Wide',     focal_range_mm: [14, 24],  usage: 'epic environment, scale reveal' },
  INSERT: { name: 'Insert/Abstract', focal_range_mm: [35, 50], usage: 'VFX, transition, graphic element', benchmark_frames: ['seq_07'] },
});

// ── Camera Motion Presets ─────────────────────────────────────
const CAMERA_MOTIONS = Object.freeze({
  STATIC:       { id: 'static',        prompt_term: 'static camera, locked off',                                 energy: 'controlled' },
  MICRO_PUSH:   { id: 'micro_push',    prompt_term: 'ultra-subtle dolly push, barely perceptible',               energy: 'intimate' },
  DOLLY_BACK:   { id: 'dolly_back',    prompt_term: 'slow dolly back reveal, smooth motion',                     energy: 'reveal' },
  DOLLY_IN:     { id: 'dolly_in',      prompt_term: 'slow creeping dolly in, cinematic approach',                energy: 'tension' },
  CRANE_UP:     { id: 'crane_up',      prompt_term: 'slow crane upward reveal, architectural scale',             energy: 'grandeur' },
  CRANE_DOWN:   { id: 'crane_down',    prompt_term: 'descending crane shot, god\'s eye to human',                energy: 'immersion' },
  ORBIT_SLOW:   { id: 'orbit_slow',    prompt_term: 'slow orbital arc around subject, 360 reveal',               energy: 'showcase' },
  PARALLAX:     { id: 'parallax',      prompt_term: 'subtle parallax foreground-background motion',              energy: 'depth' },
  TRACKING_L:   { id: 'tracking_left', prompt_term: 'smooth camera track left, following subject',               energy: 'narrative' },
  HANDHELD_SUB: { id: 'handheld_sub',  prompt_term: 'subtle handheld breathing, organic stability',              energy: 'authentic' },
});

// ── Post-Production Effect Presets ────────────────────────────
const POST_FX = Object.freeze({
  BENCHMARK_STANDARD: {
    id:                 'benchmark_standard',
    name:               'Benchmark Standard',
    bloom:              { enabled: true,  intensity: 0.6, threshold: 0.85, radius: 12 },
    film_grain:         { enabled: false, intensity: 0.0 }, // near-absent in benchmark
    vignette:           { enabled: true,  intensity: 0.55, softness: 0.7 },
    chromatic_ab:       { enabled: false, intensity: 0.0 },
    motion_blur:        { enabled: false, shutter_angle: 180 }, // 24fps natural
    dof_render:         true,
    sss_skin:           true,
    hair_strand_sim:    true,
    volumetric_light:   'conditional', // seq_15 has it
    god_rays:           'conditional',
    dust_particles:     'conditional',
    benchmark_score:    8.5,
  },
  LUXURY_PREMIUM: {
    id:                 'luxury_premium',
    name:               'Luxury Premium',
    bloom:              { enabled: true,  intensity: 0.75, threshold: 0.80, radius: 16 },
    film_grain:         { enabled: true,  intensity: 0.12 }, // subtle analog warmth
    vignette:           { enabled: true,  intensity: 0.65, softness: 0.8 },
    chromatic_ab:       { enabled: false, intensity: 0.0 },
    motion_blur:        { enabled: true,  shutter_angle: 180 },
    dof_render:         true,
    sss_skin:           true,
    hair_strand_sim:    true,
    volumetric_light:   true,
    god_rays:           false,
    dust_particles:     false,
  },
  MARITIME_EXTERIOR: {
    id:                 'maritime_exterior',
    name:               'Maritime Exterior',
    bloom:              { enabled: true,  intensity: 0.8, threshold: 0.75, radius: 20 }, // sun on water
    film_grain:         { enabled: true,  intensity: 0.08 },
    vignette:           { enabled: true,  intensity: 0.35, softness: 0.6 },
    chromatic_ab:       { enabled: true,  intensity: 0.15 }, // atmospheric distortion
    motion_blur:        { enabled: true,  shutter_angle: 180 },
    dof_render:         false, // deep focus for seascape
    sss_skin:           false,
    hair_strand_sim:    false,
    volumetric_light:   true,
    god_rays:           false,
    lens_flare:         true,
    water_reflections:  true,
  },
  ARCHITECTURAL_REVEAL: {
    id:                 'architectural_reveal',
    name:               'Architectural Reveal',
    bloom:              { enabled: true,  intensity: 0.5, threshold: 0.90, radius: 10 },
    film_grain:         { enabled: true,  intensity: 0.10 },
    vignette:           { enabled: true,  intensity: 0.40, softness: 0.75 },
    chromatic_ab:       { enabled: false, intensity: 0.0 },
    motion_blur:        { enabled: false, shutter_angle: 180 },
    dof_render:         false, // deep focus
    sss_skin:           false,
    hair_strand_sim:    false,
    volumetric_light:   true,
    god_rays:           true,
    dust_particles:     true,
    benchmark_score:    9.0, // seq_15 reference
  },
});

// ── Quality Signals Checklist ─────────────────────────────────
// Derived from top-scoring frames in benchmark analysis
const QUALITY_SIGNALS = Object.freeze([
  { signal: 'subsurface_scattering',    weight: 0.20, description: 'Skin SSS — pinkish transmission through ear/cheek/knuckle skin' },
  { signal: 'hair_rim_strand_sep',      weight: 0.15, description: 'Hair rim light with individual strand separation + specular per-strand' },
  { signal: 'volumetric_atmosphere',    weight: 0.18, description: 'Atmospheric haze, god rays, or particle scatter in light' },
  { signal: 'catchlight_quality',       weight: 0.10, description: 'Teardrop specular catchlight in ocular wet surface' },
  { signal: 'narrative_coherence',      weight: 0.15, description: 'Consistent subject/asset across all shots — no identity drift' },
  { signal: 'color_grade_consistency',  weight: 0.10, description: 'Single LUT tone maintained through entire sequence' },
  { signal: 'camera_motion_smoothness', weight: 0.07, description: 'Motion blur artifacts absent; smooth interpolation' },
  { signal: 'temporal_stability',       weight: 0.05, description: 'No flickering, no ghost frames, no subject warp' },
]);

// ── Kling 3.0 Output Specs (calibrated) ──────────────────────
const KLING_OUTPUT_SPECS = Object.freeze({
  native_resolution: { width: 1176, height: 784 },
  target_fps:        24,
  target_duration_s: { min: 5, max: 15, benchmark: 15.04 },
  bitrate_mbps:      { target: 6.5, min: 4.0, max: 8.0 },
  codec:             'h264',
  color_space:       'rec709',
  cdn_budget_mb:     50, // per cinema job at 15s
  multi_call_strategy: true, // separate Kling call per 5s segment, then concat
  aspect_ratios:     ['16:9', '3:2', '4:3', '9:16'],
  default_ratio:     '3:2', // matches benchmark 1176×784
});

// ── CLIP Semantic Quality Thresholds ─────────────────────────
const QA_THRESHOLDS = Object.freeze({
  clip_similarity_min:       0.72,  // semantic match to prompt
  style_embedding_min:       0.65,  // visual style consistency vs reference
  temporal_stability_min:    0.88,  // optical-flow consistency score
  face_coherence_min:        0.80,  // identity preservation across frames
  benchmark_score_target:    8.0,   // composite quality gate
  auto_reject_below:         6.5,   // auto-trigger regeneration
  hitl_review_range:         [6.5, 7.5], // human review zone
  auto_approve_above:        7.5,   // auto-approve to delivery
});

module.exports = {
  BENCHMARK_METADATA,
  COLOR_PROFILES,
  DOF_PRESETS,
  LIGHTING_RIGS,
  SHOT_TYPES,
  CAMERA_MOTIONS,
  POST_FX,
  QUALITY_SIGNALS,
  KLING_OUTPUT_SPECS,
  QA_THRESHOLDS,
};
