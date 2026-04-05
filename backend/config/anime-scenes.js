'use strict';
// ══════════════════════════════════════════════════════════════
// DESIGNOS v1.2.0 · Anime Cinematic Storyboard
//
// 5-scene narrative sequence: "The Creator" — an anime woman
// in a dim creative studio who draws glowing strokes that come
// to life, culminating in a cinematic multi-panel reveal.
//
// Mapped 1-to-1 to Kling 3.0 pro calls:
//   - Each scene = 1 Kling call (5s default, 10s hero shots)
//   - Total sequence: ~40s across 5 shots
//   - Style: expressive anime-realism, warm amber, soft grain
// ══════════════════════════════════════════════════════════════

// ── Color palette (warm anime-cinematic) ─────────────────────
const ANIME_COLOR_PALETTE = {
  skin_base:         '#E8C4A0',   // warm anime skin
  skin_sss:          '#E88080',   // SSS pink undertone
  hair_dark:         '#1A0A0A',   // near-black hair
  hair_rim:          '#C87820',   // warm amber rim on hair
  eye_iris:          '#6080A0',   // reflective iris (blue-grey)
  eye_reflection:    '#F5E8D0',   // warm catchlight
  bg_studio:         '#120A06',   // dim creative studio black
  bg_warm:           '#1E0E06',   // warm dim surround
  light_key:         '#FFCC88',   // warm golden key light
  light_glow:        '#FFFFFF',   // pure white glow strokes
  particle_warm:     '#FFD080',   // warm particle trails
  bloom_glow:        '#FFF5E0',   // soft bloom highlight
  line_art:          '#FFFFFF',   // clean vector line art
  sketch_rough:      '#C8B090',   // rough sketch amber tone
  watercolor_wash:   '#E8D0B0',   // soft watercolor wash
};

// ── Anime cinematic style block (all shots share this base) ──
const ANIME_STYLE_BASE = [
  'expressive anime-realism hybrid',
  'clean line art with minimal cel shading',
  'warm romantic tone',
  'soft cinematic film grain',
  'physically accurate lighting',
  'teal-orange color grade',
  '4K 24fps',
  'cinematic broadcast quality',
  'no watermark, no text overlay',
].join(', ');

const ANIME_NEGATIVE_PROMPT = [
  'western cartoon style', 'blurry', 'low quality', 'nsfw',
  'deformed anatomy', 'extra limbs', 'morphing face', 'identity drift',
  'flat lighting', 'overexposed', 'plastic skin', 'jpeg artifacts',
  'temporal flickering', 'motion blur artifact', 'watermark', 'text',
  '3d cgi render', 'uncanny valley hyper-realistic',
].join(', ');

// ════════════════════════════════════════════════════════════
// THE 5-SCENE SEQUENCE
// ════════════════════════════════════════════════════════════
const ANIME_SCENES = [

  // ─────────────────────────────────────────────────────────
  // SCENE 1 · 0–5 s · ECU PORTRAIT PUSH-IN
  // "Introduction" — the creator's face in warm studio light
  // ─────────────────────────────────────────────────────────
  {
    scene_id:        'anime_s01',
    scene_number:    1,
    title:           'The Creator — Portrait Reveal',
    timecode_in:     '00:00:00',
    timecode_out:    '00:00:05',
    duration_s:      5,

    description: 'Extreme close-up of a young anime woman, soft smile, reflective eyes, delicate features. Dim creative studio. Warm golden key light from front-right. Rim light from upper-left. Faint volumetric rays. Subtle breathing and hair movement. Focus shifts from lips to eyes.',

    shot_type:       'ECU',
    focal_mm:        85,
    aperture:        'f/1.8',
    camera_motion:   'micro_push',
    camera_control: {
      type:       'linear',
      horizontal: 0,
      vertical:   0,
      zoom:       0.04,     // slow subtle push-in
      tilt:       0,
      pan:        0,
      roll:       0,
    },

    kling_prompt: [
      'extreme close-up anime woman face, ECU portrait 85mm f/1.8',
      'soft smile, slightly parted lips, glistening reflective eyes',
      'delicate anime facial features, clean line art, minimal shading',
      'dim creative studio, warm golden key light from front-right',
      'soft blue-white rim light from upper-left, gentle hair rim separation',
      'faint volumetric atmospheric rays in dim studio background',
      'subtle chest breathing movement, wisps of dark hair drifting gently',
      'eye reflection flicker of studio warm light',
      'focus plane: lips → shifts slowly to eyes',
      'shallow DOF f/1.8 85mm, razor focus eye plane, circular bokeh amber orbs',
      'subsurface scattering warm skin glow, SSS pink undertone',
      'teardrop catchlight in each eye',
      'warm amber 3200K key light, teal-orange LUT',
      'individual hair strand specular rim separation',
      'slow micro push-in camera, ultra-subtle forward motion',
      ANIME_STYLE_BASE,
    ].join(', '),

    negative_prompt: ANIME_NEGATIVE_PROMPT,

    cinematic_profile: {
      color_profile_id:  'tungsten_warm',
      color_temp_k:      3200,
      lut:               'DOS_TungstenWarm_v1',
      sss_enabled:       true,
      hair_strand_detail: true,
      volumetric_light:  true,
      god_rays:          false,
      bloom:             true,
      film_grain:        0.12,
      focus_pull:        true,
    },

    quality_targets: {
      target_score:       8.5,
      temporal_stability: 0.92,
      identity_lock:      true,   // face must remain consistent
    },

    // Visual description for storyboard display
    storyboard: {
      visual_desc:    'Warm amber ECU. Her dark hair frames a soft, confident expression. Left side catches a blue-white rim. Eyes gleam with faint studio catchlights.',
      mood:           'Intimate, curious, creative',
      color_temp:     '3200K warm amber key, 5500K cool rim',
      key_light_pos:  'Front-right 45°',
      lens_icon:      '85mm · f/1.8',
      motion_desc:    'Breathes. Hair drifts. Eyes settle.',
    },
  },

  // ─────────────────────────────────────────────────────────
  // SCENE 2 · 5–10 s · MCU ORBIT + DRAWING VFX
  // "The Stroke" — she raises her hand and draws glowing art
  // ─────────────────────────────────────────────────────────
  {
    scene_id:        'anime_s02',
    scene_number:    2,
    title:           'Glowing Strokes — Drawing in Light',
    timecode_in:     '00:00:05',
    timecode_out:    '00:00:10',
    duration_s:      5,

    description: 'Medium shot, slight orbit from front-left to side. She raises her hand and draws glowing strokes in the air that emit warm light, leaving soft particle trails and bloom. Camera smoothly orbits with subtle parallax. Focus shifts from her hand to the luminous lines.',

    shot_type:       'MS',
    focal_mm:        50,
    aperture:        'f/2.0',
    camera_motion:   'orbit_slow',
    camera_control: {
      type:       'orbit',
      horizontal: 15,   // degrees — slow left-to-right orbit
      vertical:   3,
      zoom:       0,
      tilt:       -2,
      pan:        15,
      roll:       0,
    },

    kling_prompt: [
      'medium shot anime woman raising right hand, MS 50mm f/2.0',
      'drawing glowing white-gold luminous strokes in midair',
      'warm light emitted from fingertip as she draws in the air',
      'particle trails scatter from moving hand, warm golden sparks',
      'soft cinematic bloom on glowing lines, volumetric light emission',
      'the drawn strokes float and pulse in warm amber glow',
      'camera slowly orbits from front-left to side view, parallax depth',
      'focus shifts: hand detail → luminous floating light strokes',
      'shallow DOF f/2.0 50mm, soft background studio bokeh',
      'dark warm studio background #120A06, warm amber surround',
      'physically accurate hand anatomy, SSS skin on fingers',
      'she looks up at her glowing creation with wonder',
      'smooth orbit motion, slight parallax on background elements',
      ANIME_STYLE_BASE,
    ].join(', '),

    negative_prompt: ANIME_NEGATIVE_PROMPT,

    cinematic_profile: {
      color_profile_id:  'tungsten_warm',
      color_temp_k:      3200,
      lut:               'DOS_TungstenWarm_v1',
      sss_enabled:       true,
      hair_strand_detail: true,
      volumetric_light:  true,
      bloom:             true,
      film_grain:        0.10,
      vfx_self_illumination: true,
    },

    quality_targets: {
      target_score:       8.0,
      temporal_stability: 0.88,
      identity_lock:      true,
    },

    storyboard: {
      visual_desc:    'She raises her hand; a golden stroke of light appears in the air between camera and her. Particles drift. The orbit reveals the studio behind her.',
      mood:           'Wonder, creativity, magical realism',
      color_temp:     '3200K warm ambient + self-illuminated white-gold VFX',
      key_light_pos:  'Hand acts as secondary key light',
      lens_icon:      '50mm · f/2.0',
      motion_desc:    'Slow orbit, hand rises, strokes materialise.',
    },
  },

  // ─────────────────────────────────────────────────────────
  // SCENE 3 · 10–15 s · CU THROUGH FLOATING SKETCH
  // "Refinement" — sketch auto-refines into clean line art
  // ─────────────────────────────────────────────────────────
  {
    scene_id:        'anime_s03',
    scene_number:    3,
    title:           'Sketch Refines — Line Art Materialises',
    timecode_in:     '00:00:10',
    timecode_out:    '00:00:15',
    duration_s:      5,

    description: 'Close-up through a floating sketch plane. The rough sketch auto-refines into sharp clean line art, vector-precise. Bright neutral-white glow emanates from the lines. Camera slowly dollies forward through the sketch, with layered depth. Particles collapse into the forming lines.',

    shot_type:       'CU',
    focal_mm:        50,
    aperture:        'f/4.0',
    camera_motion:   'dolly_through',
    camera_control: {
      type:       'linear',
      horizontal: 0,
      vertical:   0,
      zoom:       0.12,    // dolly forward through the sketch plane
      tilt:       0,
      pan:        0,
      roll:       0,
    },

    kling_prompt: [
      'close-up view through a floating semi-transparent sketch, CU 50mm f/4',
      'rough pencil sketch visible in foreground, warm sepia #C8B090 lines',
      'the sketch morphs and auto-refines into clean white vector line art',
      'particles collapse inward and merge into the forming lines',
      'bright neutral-white light emanating from sharp clean line art edges',
      'soft cinematic bloom on white lines, gentle glow halo',
      'layered depth: rough sketch foreground → clean art midground → studio background',
      'camera slowly dollies forward, passing through the sketch plane',
      'transformation: rough amber sketch → precise white vector lines → glowing art',
      'anime character visible in background, watching the creation',
      'warm studio background dark #120A06, art self-illuminated',
      'f/4 moderate DOF, foreground sketch soft, line art in focus',
      ANIME_STYLE_BASE,
    ].join(', '),

    negative_prompt: ANIME_NEGATIVE_PROMPT,

    cinematic_profile: {
      color_profile_id:  'tungsten_warm',
      color_temp_k:      3200,
      lut:               'DOS_TungstenWarm_v1',
      sss_enabled:       false,
      volumetric_light:  false,
      bloom:             true,
      film_grain:        0.08,
      vfx_self_illumination: true,
      depth_layers:      true,
    },

    quality_targets: {
      target_score:       8.0,
      temporal_stability: 0.85,
      identity_lock:      false,   // abstract shot — character in BG only
    },

    storyboard: {
      visual_desc:    'The camera pushes through a translucent sketch. Rough amber lines sharpen into precise white vectors. Particles swarm into the lines. The completed art glows.',
      mood:           'Transformation, precision, magic',
      color_temp:     '3200K warm studio + cool white self-illumination',
      key_light_pos:  'Line art self-illuminates (no external key)',
      lens_icon:      '50mm · f/4.0',
      motion_desc:    'Dolly through sketch plane. Lines sharpen. Art glows.',
    },
  },

  // ─────────────────────────────────────────────────────────
  // SCENE 4 · 15–24 s · WIDE CINEMATIC — TRIPTYCH MORPH
  // "The Three Forms" — artwork splits into three panels
  // ─────────────────────────────────────────────────────────
  {
    scene_id:        'anime_s04',
    scene_number:    4,
    title:           'Triptych Morph — Three Forms of Art',
    timecode_in:     '00:00:15',
    timecode_out:    '00:00:24',
    duration_s:      9,    // 9s = wider + morph requires time

    description: 'Wide cinematic shot. The completed artwork splits into three floating panels: rough sketch (left), watercolor anime (centre), final clean render (right). The panels morph fluidly with particle flow between them. Lighting shifts from warm sepia to pastel to vibrant. Slow pan left to right with slight upward tilt.',

    shot_type:       'MLS',
    focal_mm:        24,
    aperture:        'f/5.6',
    camera_motion:   'pan_tilt_right',
    camera_control: {
      type:       'pan',
      horizontal: 20,     // pan left → right
      vertical:   0,
      zoom:       0,
      tilt:       5,      // slight upward tilt
      pan:        20,
      roll:       0,
    },

    kling_prompt: [
      'wide cinematic shot anime woman standing before three floating art panels, MLS 24mm f/5.6',
      'three self-illuminated floating panels in triptych formation, equally spaced',
      'LEFT panel: rough warm-sepia pencil sketch style, amber #C8B090 tones',
      'CENTRE panel: soft watercolor anime painting style, pastel warm palette',
      'RIGHT panel: final clean sharp anime render, vibrant warm-cool contrast',
      'particle flow streams between panels like glowing fireflies connecting the three',
      'gradient lighting shift across scene: warm sepia LEFT → soft pastel CENTRE → vibrant warm RIGHT',
      'she stands in silhouette between panels, slight profile facing left panel',
      'slow camera pan left-to-right revealing all three panels, slight upward tilt',
      'dark warm amber room #1E0E06, god ray light shafts from upper-right window',
      'dust particles floating in light beams, sacred gallery atmosphere',
      'panel light: each panel acts as its own key light (cool 5500K self-illuminated)',
      'warm amber 2800K room ambient surround, contrast with cool panel glow',
      'physically accurate global illumination, panel reflections on studio floor',
      'f/5.6 moderate-deep focus, all three panels sharp',
      'cinematic 16:9, broadcast quality',
      ANIME_STYLE_BASE,
    ].join(', '),

    negative_prompt: ANIME_NEGATIVE_PROMPT,

    cinematic_profile: {
      color_profile_id:  'sacred_volumetric',
      color_temp_k:      2800,
      lut:               'DOS_SacredVolumetric_v1',
      sss_enabled:       true,
      volumetric_light:  true,
      god_rays:          true,
      dust_particles:    true,
      bloom:             true,
      film_grain:        0.10,
      vfx_self_illumination: true,
      global_illumination: true,
    },

    quality_targets: {
      target_score:       8.5,
      temporal_stability: 0.87,
      identity_lock:      true,
    },

    storyboard: {
      visual_desc:    'Three glowing panels float in a warm dark gallery. Left: rough sketch. Centre: watercolor. Right: final render. She stands between them, golden-lit from below. God rays cut through from upper right.',
      mood:           'Revelation, artistic duality, wonder',
      color_temp:     '2800K warm surround + 5500K panel self-light + 4500K god ray',
      key_light_pos:  'Three panels = three key lights + god ray from upper-right',
      lens_icon:      '24mm · f/5.6',
      motion_desc:    'Slow pan across triptych. Particles flow between panels.',
    },
  },

  // ─────────────────────────────────────────────────────────
  // SCENE 5 · 24–34 s · HERO PULL-BACK — THE REVEAL
  // "The World" — she and the art, eye reflection, pull-back
  // ─────────────────────────────────────────────────────────
  {
    scene_id:        'anime_s05',
    scene_number:    5,
    title:           'Hero Reveal — The World She Created',
    timecode_in:     '00:00:24',
    timecode_out:    '00:00:34',
    duration_s:      10,   // 10s hero shot

    description: 'Hero shot, slow pull-back. The final artwork floats with strong warm glow and soft bloom. The artwork is reflected in her eyes, visible in a gentle ECU insert. Particles fade slowly as the scene settles into the final frame. 16:9 wide composition.',

    shot_type:       'MLS',
    focal_mm:        35,
    aperture:        'f/4.0',
    camera_motion:   'dolly_back',
    camera_control: {
      type:       'linear',
      horizontal: 0,
      vertical:   -3,     // slight downward as pulling back
      zoom:       -0.08,  // slow pull-back
      tilt:       -3,
      pan:        0,
      roll:       0,
    },

    kling_prompt: [
      'hero cinematic shot anime woman and her floating final artwork, MLS 35mm f/4.0',
      'slow pull-back camera reveals full scene: anime woman centre, artwork hovering right',
      'the final clean line art anime panel floats with strong warm glow, soft golden bloom',
      'her eyes gently reflect the glowing artwork — visible in a subtle brief ECU insert',
      'artwork reflection visible as tiny warm glow in her eye catchlights',
      'particles that created the art slowly fade and settle to floor like embers',
      'warm golden god ray shafts from upper right window illuminate the artwork',
      'sacred quiet atmosphere, the creation moment has passed',
      'she stands relaxed, profile or 3/4, quiet satisfaction',
      'warm amber studio 3200K surround, deep warm-dark background',
      'floating artwork: clean anime portrait panel, self-illuminated warm white-gold glow',
      'moderate DOF f/4.0, woman and artwork both in focus, background dark bokeh',
      'slow steady pull-back dolly, reveals scale of studio and floating art',
      'cinematic 16:9, physically accurate lighting, warm romantic tone',
      'film grain, soft bloom on artwork glow, embers fading to floor',
      ANIME_STYLE_BASE,
    ].join(', '),

    negative_prompt: ANIME_NEGATIVE_PROMPT,

    cinematic_profile: {
      color_profile_id:  'tungsten_warm',
      color_temp_k:      3200,
      lut:               'DOS_TungstenWarm_v1',
      sss_enabled:       true,
      hair_strand_detail: true,
      volumetric_light:  true,
      god_rays:          true,
      bloom:             true,
      film_grain:        0.12,
      vfx_self_illumination: true,
    },

    quality_targets: {
      target_score:       9.0,
      temporal_stability: 0.90,
      identity_lock:      true,
    },

    storyboard: {
      visual_desc:    'The camera pulls back slowly. She stands before her floating creation — a glowing panel of anime art. Embers of particles settle. God rays cut through. Her eyes reflect the golden glow.',
      mood:           'Completion, wonder, quiet triumph',
      color_temp:     '3200K warm amber key + 4500K god ray + cool artwork self-light',
      key_light_pos:  'Artwork self-illumination acts as key + god ray fill',
      lens_icon:      '35mm · f/4.0',
      motion_desc:    'Slow pull-back. Particles settle. Hold on her face and art.',
    },
  },
];

// ════════════════════════════════════════════════════════════
// SEQUENCE METADATA
// ════════════════════════════════════════════════════════════
const ANIME_SEQUENCE_META = {
  sequence_id:    'the_creator_v1',
  title:          'The Creator',
  subtitle:       'An Anime Cinematic Short',
  total_duration: 34,   // seconds
  scene_count:    5,
  total_kling_calls: 5,
  style_pack:     'anime-realism-v1',
  color_grade:    'warm-amber-teal-orange',
  audio_brief:    'Gentle piano intro → magical arpeggios → orchestral swell → soft piano resolution. 34s. Warm, wonder-filled, cinematic.',
  suno_prompt:    'intimate piano intro, magical shimmer arpeggios, gentle orchestral swell at 20s, warm resolving piano outro, anime cinematic score, wonder and creativity, 34 seconds',
  elevenlabs_sfx: [
    { timecode: '00:00:05', desc: 'soft glowing stroke whoosh, warm harmonic tone', duration: 1.5 },
    { timecode: '00:00:10', desc: 'particles materialising, crystalline shimmer', duration: 2.0 },
    { timecode: '00:00:15', desc: 'sketch morphing to line art, transformation shimmer', duration: 1.0 },
    { timecode: '00:00:24', desc: 'triptych panels splitting apart, magical resonance', duration: 1.5 },
    { timecode: '00:00:30', desc: 'embers fading, quiet resolution tone', duration: 3.0 },
  ],
};

// ── Kling call plan (1 call per scene) ────────────────────────
function buildAnimeKlingCallPlan(referenceImageUrl = null) {
  return ANIME_SCENES.map((scene, idx) => ({
    call_id:        `anime_call_${idx + 1}`,
    call_index:     idx,
    scene_id:       scene.scene_id,
    scene_number:   scene.scene_number,
    prompt:         scene.kling_prompt,
    negative_prompt: scene.negative_prompt,
    duration_s:     scene.duration_s,
    aspect_ratio:   '16:9',
    mode:           'pro',
    camera_control: scene.camera_control,
    cfg_scale:      0.5,
    seed:           null,   // set per-job for consistency
    reference_image: idx === 0 ? referenceImageUrl : null,
    cinematic_profile: scene.cinematic_profile,
    shots_in_call:  [scene.scene_id],
    quality_target: scene.quality_targets.target_score,
  }));
}

// ── Scene summary for API responses ──────────────────────────
function getSceneSummaries() {
  return ANIME_SCENES.map(s => ({
    scene_id:     s.scene_id,
    scene_number: s.scene_number,
    title:        s.title,
    duration_s:   s.duration_s,
    shot_type:    s.shot_type,
    focal_mm:     s.focal_mm,
    target_score: s.quality_targets.target_score,
    storyboard:   s.storyboard,
  }));
}

module.exports = {
  ANIME_SCENES,
  ANIME_SEQUENCE_META,
  ANIME_COLOR_PALETTE,
  ANIME_STYLE_BASE,
  ANIME_NEGATIVE_PROMPT,
  buildAnimeKlingCallPlan,
  getSceneSummaries,
};
