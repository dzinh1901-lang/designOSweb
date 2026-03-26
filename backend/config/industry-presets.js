'use strict';
// ══════════════════════════════════════════════════════════════
// DESIGNOS v1.1.0 · Industry Preset Engine
//
// Pre-built cinematic presets for three target industries.
// Each preset is a complete pipeline configuration derived from:
//  - Benchmark analysis (hf_20260322_125816)
//  - Industry-specific visual language research
//  - Kling 3.0 prompt engineering best practices
//
// Usage:
//   const { getPreset, INDUSTRY_PRESETS } = require('./industry-presets');
//   const preset = getPreset('commercial_real_estate', 'penthouse_golden_hour');
// ══════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// INDUSTRY: COMMERCIAL REAL ESTATE
// Visual language: Sacred volumetrics, god rays, architectural
// grandeur, warm amber interiors, deep focus full-building scale
// Benchmark reference: seq_15 (9.0/10) — god rays + floating panels
// ════════════════════════════════════════════════════════════
const COMMERCIAL_REAL_ESTATE_PRESETS = {

  penthouse_golden_hour: {
    id:          'penthouse_golden_hour',
    name:        'Penthouse — Golden Hour Reveal',
    description: 'Luxury penthouse or high-rise with dramatic sunset reveal and warm interior',
    industry:    'commercial_real_estate',
    render_mode: 'cinema',

    prompt_template: 'Luxury {property_type} {location}, golden hour architectural reveal, warm amber sunlight flooding through floor-to-ceiling windows, cast light pools on {material_floor} floors, {sky_condition}, cinematic slow crane upward reveal, volumetric dust particles in light beams',
    prompt_variables: {
      property_type: ['penthouse', 'luxury high-rise tower', 'landmark residential tower'],
      location:      ['city skyline backdrop', 'oceanfront', 'central business district'],
      material_floor: ['travertine', 'herringbone oak', 'polished marble'],
      sky_condition:  ['scattered cloud formation', 'clear golden sky', 'dramatic cirrus cloud formation'],
    },

    kling_system_prompt: `Cinematic luxury real estate reveal. Golden hour. Warm amber light 3200K. Slow crane upward shot. Deep focus f/8. Architectural grandeur. Volumetric god ray light shafts through windows. Dust particles in light beams. Warm amber interior, dark surround corners. Floor-to-ceiling glass facade. Sacred atmosphere. Broadcast quality. 24fps. No watermark.`,

    shot_sequence: [
      {
        shot_id: 'cre_s01', shot_type: 'XWS', focal_mm: 24, camera_motion: 'crane_up', duration_s: 5,
        kling_prompt: 'slow crane upward reveal luxury high-rise tower, golden hour city skyline, warm amber light 3200K, deep focus f/8, architectural grandeur, volumetric atmosphere, no people, photorealistic',
      },
      {
        shot_id: 'cre_s02', shot_type: 'MLS', focal_mm: 35, camera_motion: 'dolly_in', duration_s: 5,
        kling_prompt: 'cinematic slow dolly into luxury facade glass curtain wall, warm reflected golden sunset, architectural details premium materials, atmospheric depth, broadcast quality',
      },
      {
        shot_id: 'cre_s03', shot_type: 'MS', focal_mm: 35, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'luxury penthouse interior, dramatic god ray light shafts from floor-to-ceiling windows, dust particles in golden light beams, warm amber walls, floating illuminated art panels, dark luxury surround, sacred atmosphere',
      },
    ],

    color_profile_id:       'sacred_volumetric',
    lighting_rig_id:        'sacred_god_rays',
    lut_name:               'DOS_SacredVolumetric_v1',
    color_temp_k:           3200,
    post_fx_id:             'architectural_reveal',
    sss_enabled:            false,
    volumetric_light:       true,
    god_rays:               true,
    dust_particles:         true,
    maritime_reflection_lora: false,
    audio_mood:             'inspiring',
    suno_style:             'cinematic orchestral, rising strings, epic reveal, luxury prestige',

    quality_targets: { clip_similarity_min: 0.72, temporal_stability: 0.88, target_score: 8.5 },
    tags: ['penthouse', 'high-rise', 'golden hour', 'god rays', 'luxury interior', 'architectural reveal'],
  },

  luxury_villa_aerial: {
    id:          'luxury_villa_aerial',
    name:        'Luxury Villa — Aerial Estate Reveal',
    description: 'Aerial approach to luxury villa or estate, dramatic sky, pool, gardens',
    industry:    'commercial_real_estate',
    render_mode: 'cinema',

    prompt_template: 'Aerial reveal luxury {property_type} {landscape_feature}, golden hour, dramatic sky, {architecture_style} architecture, surrounded by {landscape}, swimming pool reflection, cinematic aerial crane',
    prompt_variables: {
      property_type:     ['villa', 'mansion', 'estate', 'resort residence'],
      landscape_feature: ['hillside overlooking ocean', 'vineyard valley', 'coastal clifftop'],
      architecture_style: ['Mediterranean', 'contemporary minimalist', 'Hamptons white'],
      landscape:          ['manicured gardens', 'olive groves', 'tropical palms'],
    },

    kling_system_prompt: `Cinematic aerial luxury villa reveal. Golden hour warm light. Slow aerial crane-up establishing shot. Deep focus. Swimming pool infinity edge with reflection. Architectural prestige. Warm amber grade. Broadcast quality.`,

    shot_sequence: [
      {
        shot_id: 'villa_s01', shot_type: 'XWS', focal_mm: 16, camera_motion: 'crane_up', duration_s: 5,
        kling_prompt: 'aerial reveal luxury villa estate, golden hour warm amber light, dramatic sky, infinity pool reflection, manicured gardens, Mediterranean architecture, slow crane upward, cinematic',
      },
      {
        shot_id: 'villa_s02', shot_type: 'LS', focal_mm: 24, camera_motion: 'parallax', duration_s: 5,
        kling_prompt: 'luxury villa facade close approach, golden hour side lighting, architectural detail stone facade, pool terrace, warm amber grade, atmospheric depth',
      },
      {
        shot_id: 'villa_s03', shot_type: 'MS', focal_mm: 35, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'luxury villa interior living room, god ray light shafts, warm amber, floor to ceiling windows, pool view, premium finishes, sacred atmosphere',
      },
    ],

    color_profile_id:  'sacred_volumetric',
    lighting_rig_id:   'golden_hour_rim',
    lut_name:          'DOS_SacredVolumetric_v1',
    post_fx_id:        'architectural_reveal',
    volumetric_light:  true,
    god_rays:          true,
    audio_mood:        'inspiring',
    tags:              ['villa', 'estate', 'aerial', 'pool', 'architectural'],
  },

  commercial_tower_night: {
    id:          'commercial_tower_night',
    name:        'Commercial Tower — Blue Hour Prestige',
    description: 'Premium office tower at blue hour / dusk, illuminated glass curtain wall',
    industry:    'commercial_real_estate',
    render_mode: 'cinema',

    prompt_template: 'Luxury commercial office tower, {time_of_day}, illuminated glass curtain wall, city skyline, {architectural_feature}, prestige brand identity',
    prompt_variables: {
      time_of_day:         ['blue hour twilight', 'dusk warm transition'],
      architectural_feature: ['triple-height lobby atrium', 'distinctive crown feature', 'rooftop garden terrace'],
    },

    kling_system_prompt: `Premium commercial real estate tower. Blue hour. Illuminated glass facade. City skyline reflection. Slow upward crane. Deep focus architectural reveal. Prestige grade.`,

    shot_sequence: [
      {
        shot_id: 'tower_s01', shot_type: 'XWS', focal_mm: 16, camera_motion: 'crane_up', duration_s: 5,
        kling_prompt: 'premium office tower blue hour dusk, illuminated glass curtain wall, city skyline, slow crane reveal upward, deep focus, prestige architectural photography',
      },
      {
        shot_id: 'tower_s02', shot_type: 'MS', focal_mm: 35, camera_motion: 'dolly_in', duration_s: 5,
        kling_prompt: 'luxury lobby atrium interior, warm amber lighting, premium marble floor, slow dolly in, atmospheric depth, prestige quality',
      },
    ],

    color_profile_id:  'sacred_volumetric',
    lighting_rig_id:   'sacred_god_rays',
    lut_name:          'DOS_CandlelightFilm_v1',
    post_fx_id:        'architectural_reveal',
    volumetric_light:  true,
    audio_mood:        'inspiring',
    tags:              ['office tower', 'commercial', 'blue hour', 'prestige'],
  },
};

// ════════════════════════════════════════════════════════════
// INDUSTRY: MARITIME
// Visual language: Golden ocean horizon, maritime physics LoRA,
// coastal atmosphere, superyacht lifestyle, water reflections
// Benchmark note: No direct maritime benchmark frame —
// extrapolated from color science + warm outdoor lighting system
// ════════════════════════════════════════════════════════════
const MARITIME_PRESETS = {

  superyacht_sunset: {
    id:          'superyacht_sunset',
    name:        'Superyacht — Golden Ocean Sunset',
    description: 'Hero superyacht underway on golden open ocean at sunset',
    industry:    'maritime',
    render_mode: 'cinema',

    prompt_template: 'Luxury superyacht {vessel_size} underway on {sea_condition} ocean, {time_of_day}, {sky_condition}, maritime reflection, atmospheric horizon haze, {camera_perspective}',
    prompt_variables: {
      vessel_size:      ['50-meter motor yacht', '60-meter explorer yacht', '40-meter sailing yacht'],
      sea_condition:    ['calm glassy', 'gentle swell', 'deep blue'],
      time_of_day:      ['golden hour sunset', 'late afternoon golden', 'magic hour twilight'],
      sky_condition:    ['dramatic cloud formation on horizon', 'clear golden sky', 'scattered mackerel clouds'],
      camera_perspective: ['cinematic slow tracking alongside port beam', 'aerial stern view following wake', 'low-angle ocean level shot'],
    },

    kling_system_prompt: `Luxury superyacht cinematography. Golden hour sunset. Warm amber ocean reflection. Maritime physics-accurate water. Atmospheric horizon haze. Slow tracking camera. White gleaming hull. Teal-orange color grade. Broadcast quality. No watermark.`,

    shot_sequence: [
      {
        shot_id: 'yacht_s01', shot_type: 'XWS', focal_mm: 24, camera_motion: 'tracking_left', duration_s: 5,
        kling_prompt: 'luxury superyacht 50m motor yacht underway golden ocean sunset, warm amber reflection, atmospheric horizon haze, slow cinematic tracking shot port beam, maritime physics water, broadcast quality',
      },
      {
        shot_id: 'yacht_s02', shot_type: 'MS', focal_mm: 50, camera_motion: 'orbit_slow', duration_s: 5,
        kling_prompt: 'luxury yacht deck lifestyle, golden sunset behind, talent in white linen, slow orbit, warm amber grade, shallow DOF 85mm, maritime atmosphere',
      },
      {
        shot_id: 'yacht_s03', shot_type: 'ECU', focal_mm: 85, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'extreme close up superyacht detail, teak deck, stainless hardware, warm rim light, f/1.4 bokeh, maritime golden hour insert shot',
      },
    ],

    color_profile_id:         'maritime_daylight',
    lighting_rig_id:          'maritime_sunset',
    lut_name:                 'DOS_MaritimeDaylight_v1',
    post_fx_id:               'maritime_exterior',
    sss_enabled:              false,
    volumetric_light:         true,
    maritime_reflection_lora: true,
    audio_mood:               'adventurous',
    suno_style:               'cinematic adventure, ocean wind, luxury travel, brass and strings',

    quality_targets: { clip_similarity_min: 0.70, temporal_stability: 0.85, target_score: 8.0 },
    tags: ['superyacht', 'sunset', 'ocean', 'maritime', 'luxury', 'lifestyle'],
  },

  superyacht_interior: {
    id:          'superyacht_interior',
    name:        'Superyacht Interior — Salon Luxury Reveal',
    description: 'Luxury superyacht main salon interior with porthole light shafts and premium finishes',
    industry:    'maritime',
    render_mode: 'cinema',

    prompt_template: 'Luxury superyacht main salon interior, {lighting_condition}, {design_style} interior design, {materials}, ocean view through portholes/windows, {camera_motion}',
    prompt_variables: {
      lighting_condition: ['warm afternoon porthole light shafts', 'golden hour ocean light flooding in'],
      design_style:       ['contemporary Italian', 'Art Deco', 'Scandinavian minimalist'],
      materials:          ['burled walnut paneling and cream leather', 'teak and white lacquer', 'onyx and stainless'],
      camera_motion:      ['slow push into salon from aft deck', 'static hero architectural interior'],
    },

    kling_system_prompt: `Luxury superyacht interior. Warm porthole light shafts. Premium finishes. Sacred atmosphere. Volumetric ocean light. Warm amber 3200K. Atmospheric depth. Broadcast quality.`,

    shot_sequence: [
      {
        shot_id: 'yint_s01', shot_type: 'MLS', focal_mm: 24, camera_motion: 'dolly_in', duration_s: 5,
        kling_prompt: 'luxury superyacht main salon interior, warm afternoon porthole light shafts on ocean, burled walnut paneling cream leather, slow dolly in, warm amber grade, atmospheric depth, premium finishes',
      },
      {
        shot_id: 'yint_s02', shot_type: 'MS', focal_mm: 35, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'superyacht interior triptych floating configuration panels, warm porthole light, dark luxury surround, art reveal, god ray shafts',
      },
    ],

    color_profile_id:   'sacred_volumetric',
    lighting_rig_id:    'sacred_god_rays',
    lut_name:           'DOS_SacredVolumetric_v1',
    post_fx_id:         'architectural_reveal',
    volumetric_light:   true,
    god_rays:           true,
    audio_mood:         'luxurious',
    tags:               ['superyacht', 'interior', 'salon', 'luxury', 'porthole'],
  },

  port_arrival: {
    id:          'port_arrival',
    name:        'Port Arrival — Dusk Harbour',
    description: 'Dramatic superyacht arrival into luxury marina at dusk',
    industry:    'maritime',
    render_mode: 'cinema',

    prompt_template: 'Luxury superyacht arriving {marina_type} marina, {time_of_day}, harbour lights reflecting on water, {city_backdrop}, {weather}',
    prompt_variables: {
      marina_type:   ['Monaco', 'Antibes', 'St Tropez', 'Port Hercule', 'luxury private'],
      time_of_day:   ['blue hour dusk', 'golden hour sunset', 'twilight'],
      city_backdrop: ['principality skyline', 'hillside village backdrop', 'ancient citadel behind'],
      weather:       ['calm clear', 'scattered clouds dramatic sky'],
    },

    kling_system_prompt: `Superyacht port arrival. Dusk harbour. Marina lights reflecting water. Blue hour atmosphere. Warm interior illumination from vessel. Cinematic slow tracking. Premium maritime photography.`,

    shot_sequence: [
      {
        shot_id: 'port_s01', shot_type: 'XWS', focal_mm: 24, camera_motion: 'tracking_left', duration_s: 5,
        kling_prompt: 'luxury superyacht arriving Monaco harbour blue hour dusk, marina lights reflecting calm water, principality skyline backdrop, cinematic slow tracking, atmospheric maritime photography',
      },
      {
        shot_id: 'port_s02', shot_type: 'MLS', focal_mm: 35, camera_motion: 'crane_down', duration_s: 5,
        kling_prompt: 'superyacht marina berth dusk, gangway deployment, warm interior lights through windows, water reflections, premium maritime lifestyle, crane down reveal',
      },
    ],

    color_profile_id:         'maritime_daylight',
    lighting_rig_id:          'maritime_sunset',
    lut_name:                 'DOS_MaritimeDaylight_v1',
    post_fx_id:               'maritime_exterior',
    maritime_reflection_lora: true,
    audio_mood:               'adventurous',
    tags:                     ['port', 'arrival', 'marina', 'dusk', 'harbour'],
  },
};

// ════════════════════════════════════════════════════════════
// INDUSTRY: LUXURY BRANDING
// Visual language: SSS skin (benchmark seq_01/04), emotional
// portrait close-ups, bespoke panel reveals (seq_13),
// magical touch reveals (seq_10), teal-orange warm grade
// Benchmark reference: seq_01 (8.5/10), seq_13 (8.5/10)
// ════════════════════════════════════════════════════════════
const LUXURY_BRANDING_PRESETS = {

  hero_portrait_reveal: {
    id:          'hero_portrait_reveal',
    name:        'Hero Portrait — Emotional Brand Reveal',
    description: 'Benchmark-quality emotional portrait with SSS skin and golden rim light (seq_01 inspired)',
    industry:    'luxury_branding',
    render_mode: 'cinema',

    prompt_template: 'Luxury brand hero portrait, {talent_description}, wearing {garment}, {emotional_state}, {lighting_setup}, subsurface scattering skin, teardrop catchlight, f/1.4 85mm portrait lens, teal-orange color grade',
    prompt_variables: {
      talent_description: ['female talent anime-realism hybrid', 'elegant female ambassador', 'luxury brand talent'],
      garment:            ['white strapless silk dress', 'black velvet evening gown', 'cream cashmere knit'],
      emotional_state:    ['quiet confident', 'serene contemplative', 'subtle wonder'],
      lighting_setup:     ['golden hour rim back-light with soft Rembrandt key', 'warm tungsten 3200K key with hair rim light', 'dramatic side candlelight key'],
    },

    kling_system_prompt: `Luxury brand hero portrait. Extreme close-up face. Golden rim back-light upper-right. Soft Rembrandt key upper-left. f/1.4 85mm shallow DOF. Razor focus eye plane. Circular bokeh background. Subsurface scattering skin pink warm glow. Individual hair strand specular rim. Teardrop catchlight in eye. Warm amber 3200K. Teal-orange LUT. Micro push camera. Broadcast quality. No watermark.`,

    shot_sequence: [
      {
        shot_id: 'lux_s01', shot_type: 'ECU', focal_mm: 85, camera_motion: 'micro_push', duration_s: 5,
        kling_prompt: 'extreme close up luxury brand female portrait, golden hour warm amber rim back-light, soft Rembrandt key upper-left, f/1.4 razor focus eye plane, circular bokeh amber orbs, subsurface scattering skin pink glow, individual hair strand rim separation, teardrop catchlight eye, teal-orange LUT, ultra subtle micro push, 3200K warm tungsten, cinematic broadcast quality',
      },
      {
        shot_id: 'lux_s02', shot_type: 'MCU', focal_mm: 85, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'cinematic MCU profile portrait luxury talent white strapless dress, dramatic 3/4 side lighting 3000K candlelight key, fill ratio 6:1, warm hair rim separation, raised index finger gesture discovery, shallow DOF f/2.0, defocused warm interior background',
      },
      {
        shot_id: 'lux_s03', shot_type: 'MS', focal_mm: 35, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'luxury brand talent viewing three floating illuminated artwork panels, self-illuminated light-box panels triptych, dark warm amber studio surround, cool neutral panel light on profile, warm amber hair back-light, medium shot 35mm, bespoke selection concept',
      },
    ],

    color_profile_id:  'tungsten_warm',
    lighting_rig_id:   'golden_hour_rim',
    lut_name:          'DOS_TungstenWarm_v1',
    color_temp_k:      3200,
    post_fx_id:        'luxury_premium',
    sss_enabled:       true,
    hair_strand_detail: true,
    volumetric_light:  false,
    audio_mood:        'luxurious',
    suno_style:        'luxury brand film score, minimal piano, elegant strings, sophisticated contemporary',

    quality_targets: { clip_similarity_min: 0.74, temporal_stability: 0.90, target_score: 8.5 },
    tags: ['portrait', 'SSS', 'hero talent', 'teal-orange', 'luxury brand', 'benchmark-match'],
  },

  product_reveal_touch: {
    id:          'product_reveal_touch',
    name:        'Product Reveal — Magical Touch Activation',
    description: 'Luxury product reveal with magical self-illuminated energy emanating from touch (seq_10 inspired)',
    industry:    'luxury_branding',
    render_mode: 'cinema',

    prompt_template: 'Luxury {product_category} reveal, {talent_action} the product, magical self-illuminated {energy_style} light energy, {product_description}, dark warm amber studio, cinematic insert shot',
    prompt_variables: {
      product_category: ['luxury watch', 'fine jewellery', 'perfume bottle', 'leather goods'],
      talent_action:    ['fingertip touching', 'hand lifting', 'unveiling', 'holding delicately'],
      energy_style:     ['white particle energy filaments', 'golden light discharge', 'crystalline light traces'],
      product_description: ['platinum and diamond timepiece', 'emerald-cut diamond pendant', 'bespoke leather travel case'],
    },

    kling_system_prompt: `Luxury product reveal. Self-illuminated magical energy from fingertip touching product. Particle sparks scatter. White energy filaments. Product illuminated by touch energy. Dark warm amber background. Close-up hand insert shot 50-85mm. SSS hand skin. Subsurface scattering knuckle skin. Chromatic energy detail. Broadcast quality.`,

    shot_sequence: [
      {
        shot_id: 'prod_s01', shot_type: 'INSERT', focal_mm: 85, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'magical energy discharge fingertip touching luxury product, white particle energy filaments, self-illuminated light from hand to object, subsurface scattering skin knuckle, particle sparks scatter, dark warm amber studio, close-up insert 85mm, black background luxury reveal',
      },
      {
        shot_id: 'prod_s02', shot_type: 'CU', focal_mm: 100, camera_motion: 'micro_push', duration_s: 5,
        kling_prompt: 'luxury product hero close-up 100mm macro, self-illuminated by light energy, shallow DOF f/2.8, warm amber grade, premium craftsmanship detail, subsurface material glow, cinematic reveal',
      },
      {
        shot_id: 'prod_s03', shot_type: 'MCU', focal_mm: 50, camera_motion: 'dolly_back', duration_s: 5,
        kling_prompt: 'slow reveal dolly back from luxury product to talent MCU, talent examining product with wonder, warm amber candlelight grade, shallow DOF, luxury brand atmosphere',
      },
    ],

    color_profile_id:  'candlelight_film',
    lighting_rig_id:   'magical_practical',
    lut_name:          'DOS_CandlelightFilm_v1',
    post_fx_id:        'luxury_premium',
    sss_enabled:       true,
    audio_mood:        'luxurious',
    tags:              ['product reveal', 'magical VFX', 'touch activation', 'luxury', 'seq_10 inspired'],
  },

  bespoke_configurator: {
    id:          'bespoke_configurator',
    name:        'Bespoke Configurator — Floating Options Panel',
    description: 'Luxury bespoke selection — floating illuminated option panels triptych (seq_13 inspired)',
    industry:    'luxury_branding',
    render_mode: 'cinema',

    prompt_template: 'Luxury bespoke selection, talent viewing three floating {panel_content} panels, dark {studio_atmosphere} studio, self-illuminated light-box panels, {panel_lighting}, {talent_position}',
    prompt_variables: {
      panel_content:   ['material option', 'configuration', 'artwork collection', 'colour palette'],
      studio_atmosphere: ['warm amber', 'dark gallery', 'luxury showroom'],
      panel_lighting:  ['cool 5500K panel light against warm 2800K surround', 'neutral panel against dark warm background'],
      talent_position: ['right-frame profile viewing left panels', 'silhouette against illuminated panels'],
    },

    kling_system_prompt: `Luxury bespoke configurator. Three floating self-illuminated panels triptych. Talent in profile right-frame. Dark warm amber surround 2800K. Cool neutral 5500K panel light. Warm hair back-light maintains warmth. Bokeh books/objects in background. Meta-narrative concept. Broadcast quality.`,

    shot_sequence: [
      {
        shot_id: 'bsp_s01', shot_type: 'MS', focal_mm: 35, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'luxury talent profile right frame viewing three floating self-illuminated option panels, dark warm amber studio 2800K, cool neutral panel light 5500K, panel glow halo, triptych composition, warm hair back-light, 35mm, depth of field bokeh background, bespoke luxury selection',
      },
      {
        shot_id: 'bsp_s02', shot_type: 'MLS', focal_mm: 24, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'three floating illuminated luxury panels alone in room, dramatic god ray light shafts from upper right window, warm amber interior walls, dust particles in light, divine light on floating panels, medium long shot 24mm, sacred gallery atmosphere, no talent',
      },
      {
        shot_id: 'bsp_s03', shot_type: 'MS', focal_mm: 35, camera_motion: 'dolly_in', duration_s: 5,
        kling_prompt: 'slow dolly into bespoke luxury configuration selection, talent examining floating panels, magical gesture interaction, warm amber candlelight, luxury studio atmosphere',
      },
    ],

    color_profile_id:  'tungsten_warm',
    lighting_rig_id:   'panel_triptych',
    lut_name:          'DOS_TungstenWarm_v1',
    post_fx_id:        'luxury_premium',
    sss_enabled:       true,
    volumetric_light:  true,
    god_rays:          true,
    dust_particles:    true,
    audio_mood:        'luxurious',
    tags:              ['bespoke', 'configurator', 'panels', 'triptych', 'seq_13 inspired'],
  },

  perfume_brand_film: {
    id:          'perfume_brand_film',
    name:        'Fragrance / Perfume Brand Film',
    description: 'High-concept luxury fragrance or perfume brand film — abstract light and sensory',
    industry:    'luxury_branding',
    render_mode: 'cinema',

    prompt_template: 'Luxury fragrance brand film, {abstract_element}, {talent_moment}, golden warm light, {atmosphere}, editorial fashion photography quality',
    prompt_variables: {
      abstract_element: ['light painting trail revealing bottle silhouette', 'floating petals in warm light', 'gold dust particle cloud'],
      talent_moment:    ['eyes closed intimate moment with fragrance', 'profile breath exhale in warm light'],
      atmosphere:       ['warm amber haze, sensory atmosphere', 'intimate candlelight warm studio'],
    },

    kling_system_prompt: `Luxury fragrance brand film. Abstract light painting revealing product. Warm amber atmospheric haze. Self-illuminated golden light trail. ECU intimate portrait talent. Subsurface scattering. Hair rim separation. Teal-orange LUT. Editorial luxury quality.`,

    shot_sequence: [
      {
        shot_id: 'perf_s01', shot_type: 'INSERT', focal_mm: 50, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'abstract light painting trail revealing perfume bottle silhouette, warm amber atmospheric haze, white golden light trace calligraphy, dark moody background 2800K, volumetric haze, cinematic transition abstract shot',
      },
      {
        shot_id: 'perf_s02', shot_type: 'ECU', focal_mm: 85, camera_motion: 'micro_push', duration_s: 5,
        kling_prompt: 'extreme close up luxury talent portrait, eyes closed intimate fragrance moment, golden warm rim light back, subsurface scattering skin, individual hair strand specular, f/1.4 circular bokeh, teal-orange warm grade, editorial luxury perfume campaign quality',
      },
      {
        shot_id: 'perf_s03', shot_type: 'CU', focal_mm: 100, camera_motion: 'static', duration_s: 5,
        kling_prompt: 'luxury perfume bottle hero close-up, self-illuminated warm golden light, bokeh background, premium glass material SSS refraction, warm amber grade, product cinematic close-up',
      },
    ],

    color_profile_id:  'tungsten_warm',
    lighting_rig_id:   'magical_practical',
    lut_name:          'DOS_TungstenWarm_v1',
    post_fx_id:        'luxury_premium',
    sss_enabled:       true,
    audio_mood:        'luxurious',
    tags:              ['perfume', 'fragrance', 'abstract', 'light-painting', 'brand-film'],
  },
};

// ════════════════════════════════════════════════════════════
// MASTER PRESET REGISTRY
// ════════════════════════════════════════════════════════════
const INDUSTRY_PRESETS = Object.freeze({
  commercial_real_estate: COMMERCIAL_REAL_ESTATE_PRESETS,
  maritime:               MARITIME_PRESETS,
  luxury_branding:        LUXURY_BRANDING_PRESETS,
});

// ── Helper functions ──────────────────────────────────────
function getPreset(industry, presetId) {
  const industryPresets = INDUSTRY_PRESETS[industry];
  if (!industryPresets) throw new Error(`Unknown industry: ${industry}`);
  const preset = industryPresets[presetId];
  if (!preset) throw new Error(`Unknown preset: ${presetId} for industry ${industry}`);
  return preset;
}

function listPresets(industry) {
  if (industry) {
    const industryPresets = INDUSTRY_PRESETS[industry];
    if (!industryPresets) return [];
    return Object.values(industryPresets).map(p => ({
      id:          p.id,
      name:        p.name,
      description: p.description,
      tags:        p.tags,
      render_mode: p.render_mode,
    }));
  }
  // All presets
  return Object.entries(INDUSTRY_PRESETS).flatMap(([ind, presets]) =>
    Object.values(presets).map(p => ({ ...p, industry: ind }))
  );
}

function resolvePresetFromScene(scene) {
  const industry = scene.industry;
  const env      = scene.environment || {};
  const hasGodRays = scene.cinematic_profile?.god_rays;
  const hasSss     = scene.cinematic_profile?.sss_enabled;
  const isMaritime = scene.cinematic_profile?.maritime_reflection_lora;

  if (industry === 'commercial_real_estate') {
    if (hasGodRays || env.interior_exterior === 'both') return 'penthouse_golden_hour';
    if (env.setting?.includes('villa') || env.setting?.includes('estate')) return 'luxury_villa_aerial';
    return 'commercial_tower_night';
  }
  if (industry === 'maritime') {
    if (env.interior_exterior === 'interior') return 'superyacht_interior';
    if (env.setting?.includes('port') || env.setting?.includes('marina')) return 'port_arrival';
    return 'superyacht_sunset';
  }
  if (industry === 'luxury_branding') {
    if (hasSss && scene.shot_sequence?.[0]?.shot_type === 'ECU') return 'hero_portrait_reveal';
    if (scene.special_requirements?.some(r => r.includes('panel') || r.includes('triptych'))) return 'bespoke_configurator';
    if (scene.subjects?.some(s => s.type === 'product')) return 'product_reveal_touch';
    return 'perfume_brand_film';
  }
  return null;
}

// Build the Kling system prompt for a given preset + custom prompt
function buildKlingSystemPrompt(preset, customPrompt, variables = {}) {
  let prompt = preset.kling_system_prompt || '';

  // Resolve template variables
  if (customPrompt) {
    prompt = `${prompt}\n\nUSER CONTEXT: ${customPrompt}`;
  }

  // Inject variable overrides
  Object.entries(variables).forEach(([key, value]) => {
    prompt = prompt.replace(`{${key}}`, value);
  });

  return prompt;
}

module.exports = {
  INDUSTRY_PRESETS,
  getPreset,
  listPresets,
  resolvePresetFromScene,
  buildKlingSystemPrompt,
};
