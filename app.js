/* ══════════════════════════════════════════════════════════════
   DESIGNOS · BLUEBIRD v1.5 · CINEMATIC GENERATION ENGINE
   Marine & Real Estate · app.js — interactions, animations, canvas
══════════════════════════════════════════════════════════════ */

const html = document.documentElement;

// ── Theme engine (Obsidian ↔ Editorial Cream) ─────────────────
const themeToggle = document.getElementById('themeToggle');
const savedTheme  = localStorage.getItem('dos-theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

themeToggle?.addEventListener('click', () => {
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('dos-theme', next);
});

// ── Navbar scroll ─────────────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ── Hero particle canvas ──────────────────────────────────────
(function heroCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, pts = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  class Dot {
    constructor() { this.reset(true); }
    reset(rand) {
      this.x  = rand ? Math.random() * W : Math.random() * W;
      this.y  = rand ? Math.random() * H : -5;
      this.vx = (Math.random() - .5) * .22;
      this.vy = (Math.random() - .5) * .22;
      this.r  = Math.random() * 1.3 + .2;
      this.a  = Math.random() * .3 + .04;
      this.isRose = Math.random() > 0.7;
    }
    tick() {
      this.x += this.vx; this.y += this.vy;
      if (this.x < -5 || this.x > W + 5 || this.y < -5 || this.y > H + 5) this.reset(true);
    }
    draw() {
      const dark = html.getAttribute('data-theme') !== 'light';
      const c = this.isRose
        ? (dark ? '240,144,144' : '192,112,112')
        : (dark ? '144,200,240' : '96,144,192');
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${c},${this.a})`;
      ctx.fill();
    }
  }

  const N = Math.min(90, Math.floor(W * H / 12000));
  for (let i = 0; i < N; i++) pts.push(new Dot());

  function lines() {
    const D = 95;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < D) {
          const dark = html.getAttribute('data-theme') !== 'light';
          const a = dark ? 0.05 * (1 - d / D) : 0.08 * (1 - d / D);
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(240,144,144,${a})`;
          ctx.lineWidth = .4;
          ctx.stroke();
        }
      }
    }
  }

  (function loop() {
    ctx.clearRect(0, 0, W, H);
    lines();
    pts.forEach(p => { p.tick(); p.draw(); });
    requestAnimationFrame(loop);
  })();
})();

// ── Typewriter prompt animation ───────────────────────────────
(function typewriter() {
  const promptEl = document.getElementById('promptText');
  if (!promptEl) return;

  const prompts = [
    '"luxury superyacht at golden hour, aerial orbit, cinematic..."',
    '"penthouse terrace overlooking Manhattan at dusk, slow dolly..."',
    '"coastal villa entrance, warm afternoon light, tracking shot..."',
    '"marina district at blue hour, reflections on water, orbit..."',
    '"modern tower lobby, architectural detail, editorial style..."',
  ];

  let promptIdx = 0, charIdx = 0, deleting = false;

  function type() {
    const current = prompts[promptIdx];
    if (!deleting) {
      promptEl.textContent = current.slice(0, charIdx + 1);
      charIdx++;
      if (charIdx >= current.length) {
        deleting = true;
        setTimeout(type, 2400);
        return;
      }
    } else {
      promptEl.textContent = current.slice(0, charIdx - 1);
      charIdx--;
      if (charIdx <= 0) {
        deleting = false;
        promptIdx = (promptIdx + 1) % prompts.length;
        setTimeout(type, 400);
        return;
      }
    }
    setTimeout(type, deleting ? 22 : 38);
  }
  setTimeout(type, 800);
})();

// ── Generation stage cycler ───────────────────────────────────
(function stageCycler() {
  const stageIds = ['stage1','stage2','stage3','stage4','stage5','stage6'];
  const fillEl   = document.getElementById('gwFill');
  const etaEl    = document.getElementById('gwEta');

  let current = 2; // starts at stage3 (index 2)
  const durations = [0, 0, 3200, 4000, 3600, 2800]; // ms each stage takes

  function getEta(from) {
    return durations.slice(from + 1).reduce((a, b) => a + b, 0) / 1000;
  }

  function advance() {
    const stages = stageIds.map(id => document.getElementById(id));
    if (!stages[0]) return;

    // complete current
    stages[current].className = 'gw-stage done';
    stages[current].querySelector('.gs-icon').textContent = '✓';
    stages[current].querySelector('.gs-icon').classList.remove('spin');

    current++;
    if (current >= stageIds.length) {
      // Reset
      current = 0;
      setTimeout(() => {
        stages.forEach((s, i) => {
          if (i === 0 || i === 1) { s.className = 'gw-stage done'; s.querySelector('.gs-icon').textContent = '✓'; }
          else { s.className = 'gw-stage idle'; s.querySelector('.gs-icon').textContent = i === 2 ? '⟳' : '◌'; }
        });
        stages[2].className = 'gw-stage active';
        stages[2].querySelector('.gs-icon').classList.add('spin');
        current = 2;
        if (fillEl) fillEl.style.animation = 'none';
        setTimeout(() => { if (fillEl) fillEl.style.animation = 'fill-loop 6s ease-in-out infinite'; }, 50);
        if (etaEl) etaEl.textContent = `ETA 0:${getEta(2).toFixed(0).padStart(2,'0')}`;
        setTimeout(advance, durations[2]);
      }, 1800);
      return;
    }

    stages[current].className = 'gw-stage active';
    const icon = stages[current].querySelector('.gs-icon');
    icon.textContent = '⟳';
    icon.classList.add('spin');

    const secs = getEta(current);
    if (etaEl) etaEl.textContent = `ETA 0:${Math.round(secs).toString().padStart(2,'0')}`;

    setTimeout(advance, durations[current]);
  }

  setTimeout(advance, durations[2]);
})();

// ── Intersection observer — reveal elements ───────────────────
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el    = entry.target;
      const delay = parseInt(el.dataset.delay || '0');
      setTimeout(() => el.classList.add('visible'), delay);
      revealObs.unobserve(el);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -48px 0px' });

document.querySelectorAll('.reveal, .reveal-left').forEach(el => revealObs.observe(el));

// ── Smooth scroll ─────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
  });
});

// ── Parallax on CTA orbs ──────────────────────────────────────
document.addEventListener('mousemove', e => {
  const mx = (e.clientX / innerWidth  - .5) * 20;
  const my = (e.clientY / innerHeight - .5) * 20;
  document.querySelectorAll('.cta-orb').forEach((o, i) => {
    const f = [0.3, -0.2, 0.15][i] || 0.1;
    o.style.transform = `translateX(${mx * f - 50}%) translateY(${my * f}px)`;
  });
  document.querySelectorAll('.fcta-orb').forEach((o, i) => {
    const f = i === 0 ? 0.25 : -0.18;
    o.style.transform = `translateX(calc(-50% + ${mx * f}px)) translateY(${my * f}px)`;
  });
}, { passive: true });

// ── Hamburger ─────────────────────────────────────────────────
document.getElementById('hamburger')?.addEventListener('click', () => {
  document.querySelector('.nav-links')?.classList.toggle('mobile-open');
  document.querySelector('.nav-actions')?.classList.toggle('mobile-open');
});

// ── Pipeline step hover expansion ────────────────────────────
document.querySelectorAll('.pf-item').forEach(item => {
  item.addEventListener('mouseenter', () => {
    item.style.transition = 'opacity .3s';
  });
});

// ── QA bar animation on scroll ────────────────────────────────
const qaBarObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('.qscm-fill').forEach(bar => {
        const w = bar.style.width;
        bar.style.width = '0%';
        setTimeout(() => {
          bar.style.transition = 'width 1.2s ease';
          bar.style.width = w;
        }, 200);
      });
      qaBarObs.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });
document.querySelectorAll('.qa-score-card').forEach(el => qaBarObs.observe(el));

// ══════════════════════════════════════════════════════════════
// BENCHMARK FRAME VIEWER — interactive quality analysis
// Calibrated from: hf_20260322_125816 production Kling 3.0 output
// ══════════════════════════════════════════════════════════════
(function benchmarkViewer() {
  const frames = document.querySelectorAll('.bm-frame');
  if (!frames.length) return;

  const FRAME_DATA = [
    {
      shot:    'ECU Portrait · seq_01',
      score:   8.5,
      lut:     'DOS_TungstenWarm_v1',
      temp:    '3200K Warm Amber · Teal-Orange Grade',
      swatch:  'linear-gradient(90deg, #C47A3A, #E8A882, #F5DEC0)',
      dof:     'f/1.4 · 85mm · Extreme Shallow',
      signals: [true, true, true, true, true, true, true, true],
    },
    {
      shot:    'MCU Gesture · seq_04',
      score:   8.0,
      lut:     'DOS_CandlelightFilm_v1',
      temp:    '3000K Candlelight · Amber-Monochrome',
      swatch:  'linear-gradient(90deg, #6B3D18, #C47020, #F5E0B0)',
      dof:     'f/2.0 · 85mm · Shallow',
      signals: [true, true, false, false, true, true, true, true],
    },
    {
      shot:    'Abstract VFX · seq_07',
      score:   7.5,
      lut:     'DOS_CandlelightFilm_v1',
      temp:    '2800K Extreme Warm · Amber Monochrome',
      swatch:  'linear-gradient(90deg, #4A2808, #8B4A18, #FFFFFF)',
      dof:     'f/4–f/8 · Deep Focus · Haze-Only',
      signals: [false, false, true, false, true, true, true, true],
    },
    {
      shot:    'CU Hand Insert · seq_10',
      score:   8.0,
      lut:     'DOS_CandlelightFilm_v1',
      temp:    '3000K Warm + Cool VFX Accent',
      swatch:  'linear-gradient(90deg, #3A2010, #C07840, #FFFFFF)',
      dof:     'f/2.0 · 50–85mm · Shallow',
      signals: [true, false, true, false, true, true, true, true],
    },
    {
      shot:    'MS Panel Triptych · seq_13',
      score:   8.5,
      lut:     'DOS_TungstenWarm_v1',
      temp:    '2800K Warm Surround · 5500K Panel Light',
      swatch:  'linear-gradient(90deg, #2A1A0A, #F5F0E8, #A0A8C8)',
      dof:     'f/2.8–f/4 · 35mm · Moderate',
      signals: [true, true, true, false, true, true, true, true],
    },
    {
      shot:    'MLS God Rays · seq_15',
      score:   9.0,
      lut:     'DOS_SacredVolumetric_v1',
      temp:    '3200K Ambient · 4500K Light Shaft',
      swatch:  'linear-gradient(90deg, #8B5A20, #F5E0B0, #F8F5F0)',
      dof:     'f/5.6–f/8 · 24–35mm · Deep Focus',
      signals: [false, false, true, false, true, true, true, true],
    },
  ];

  const SIG_LABELS = [
    'Subsurface Scattering (SSS)', 'Hair Strand Rim Separation',
    'Volumetric Atmosphere',       'Teardrop Catchlight',
    'Narrative Coherence',         'Color Grade Consistency',
    'Camera Motion Smoothness',    'Temporal Stability',
  ];
  const SIG_WEIGHTS = ['×0.20','×0.15','×0.18','×0.10','×0.15','×0.10','×0.07','×0.05'];

  function updateAnalysis(idx) {
    const d = FRAME_DATA[idx];

    document.getElementById('bmaShot').textContent    = d.shot;
    document.getElementById('bmScoreNum').textContent = d.score.toFixed(1);
    document.getElementById('bmaLutName').textContent = d.lut;
    document.getElementById('bmaLutTemp').textContent = d.temp;
    document.getElementById('bmaLutSwatch').style.background = d.swatch;
    document.getElementById('bmaDof').textContent     = d.dof;

    const sigList = document.getElementById('bmaSigList');
    sigList.innerHTML = d.signals.map((on, i) => `
      <div class="bma-sig ${on ? 'active' : ''}">
        <div class="sig-dot"></div>
        <span>${SIG_LABELS[i]}</span>
        <span class="sig-w">${SIG_WEIGHTS[i]}</span>
      </div>
    `).join('');

    // Score color
    const scoreEl = document.getElementById('bmScoreNum');
    scoreEl.style.color = d.score >= 9.0 ? '#FFD700' : d.score >= 8.5 ? 'var(--rose)' : 'var(--rose)';
  }

  frames.forEach((frame, i) => {
    frame.addEventListener('click', () => {
      frames.forEach(f => f.classList.remove('active'));
      frame.classList.add('active');
      updateAnalysis(i);
    });
  });

  // Initialise with frame 0
  updateAnalysis(0);
})();

// ══════════════════════════════════════════════════════════════
// PROMPT COMPOSER — benchmark-calibrated industry presets
// ══════════════════════════════════════════════════════════════
(function promptComposer() {
  const compPresets  = document.getElementById('compPresets');
  const compPromptText = document.getElementById('compPromptText');
  const compMeta     = document.getElementById('compMeta');
  const cpbShotLabel = document.querySelector('.cpb-shot-label');
  const cpbParams    = document.querySelector('.cpb-params');
  const cqSignals    = document.getElementById('cqSignals');
  const cqScoreVal   = document.getElementById('cqScoreVal');
  const cqScoreFill  = document.getElementById('cqScoreFill');
  const compCopy     = document.getElementById('compCopy');

  if (!compPresets) return;

  const PRESETS = {
    commercial_real_estate: [
      {
        id: 'penthouse_golden_hour',
        name: 'Penthouse Golden Hour',
        desc: 'Sacred god-ray interior reveal with dust particles',
        tags: ['God Rays','3200K','Crane Up'],
        shots: [
          { label: 'Shot 01 / 03 — XWS Crane Up', prompt: 'Slow crane upward reveal luxury high-rise tower, golden hour city skyline, warm amber light 3200K, deep focus f/8, architectural grandeur, volumetric atmosphere, no people, cinematic broadcast quality, photorealistic', params: ['DOS_SacredVolumetric_v1','3200K','f/8 Deep Focus','Crane Up','God Rays ON','Quality: 8.5'] },
          { label: 'Shot 02 / 03 — MLS Dolly In', prompt: 'Cinematic slow dolly into luxury facade glass curtain wall, warm reflected golden sunset, architectural details premium materials, atmospheric depth, broadcast quality, photorealistic', params: ['DOS_SacredVolumetric_v1','3200K','f/5.6 Moderate','Dolly In','Vol Haze','Quality: 8.5'] },
          { label: 'Shot 03 / 03 — MS God Rays', prompt: 'Luxury penthouse interior, dramatic god ray light shafts from floor-to-ceiling windows, dust particles floating in golden light beams, warm amber walls, floating illuminated art panels, dark luxury surround, sacred atmosphere, cinematic', params: ['DOS_SacredVolumetric_v1','3200K + 4500K Shaft','f/8 Deep','Static','God Rays + Dust','Quality: 9.0'] },
        ],
        sss: false, hair: false, vol: true, godRays: true, maritime: false, dust: true, score: 8.7,
      },
      {
        id: 'luxury_villa_aerial',
        name: 'Luxury Villa Aerial',
        desc: 'Aerial estate reveal with infinity pool at golden hour',
        tags: ['Aerial','Golden Hour','Pool'],
        shots: [
          { label: 'Shot 01 / 02 — XWS Aerial', prompt: 'Aerial reveal luxury villa estate, golden hour warm amber light, dramatic sky, infinity pool reflection, manicured gardens, Mediterranean architecture, slow crane upward, cinematic, photorealistic, broadcast quality', params: ['DOS_SacredVolumetric_v1','3200K','f/8 Deep Focus','Crane Up','Vol Light','Quality: 8.5'] },
          { label: 'Shot 02 / 02 — MS Interior', prompt: 'Luxury villa interior living room, god ray light shafts floor-to-ceiling windows, warm amber, pool view, premium finishes, sacred atmosphere, static camera, photorealistic', params: ['DOS_SacredVolumetric_v1','3200K','f/7.1 Deep','Static','God Rays','Quality: 8.5'] },
        ],
        sss: false, hair: false, vol: true, godRays: true, maritime: false, dust: true, score: 8.5,
      },
      {
        id: 'commercial_tower_night',
        name: 'Commercial Tower Blue Hour',
        desc: 'Premium office tower at blue hour dusk',
        tags: ['Blue Hour','Prestige','Glass Facade'],
        shots: [
          { label: 'Shot 01 / 02 — XWS Crane Up', prompt: 'Premium office tower blue hour dusk, illuminated glass curtain wall, city skyline, slow crane reveal upward, deep focus, prestige architectural photography, cinematic broadcast quality', params: ['DOS_CandlelightFilm_v1','Blue Hour','f/8 Deep Focus','Crane Up','No Vol','Quality: 8.0'] },
          { label: 'Shot 02 / 02 — MS Lobby', prompt: 'Luxury lobby atrium interior, warm amber lighting, premium marble floor, slow dolly in, atmospheric depth, prestige quality, broadcast quality', params: ['DOS_CandlelightFilm_v1','3200K','f/5.6','Dolly In','Warm Haze','Quality: 8.0'] },
        ],
        sss: false, hair: false, vol: false, godRays: false, maritime: false, dust: false, score: 8.0,
      },
    ],
    maritime: [
      {
        id: 'superyacht_sunset',
        name: 'Superyacht Sunset',
        desc: 'Hero vessel on golden ocean with maritime LoRA',
        tags: ['Maritime LoRA','Golden Ocean','Tracking'],
        shots: [
          { label: 'Shot 01 / 03 — XWS Tracking', prompt: 'Luxury superyacht 50m motor yacht underway golden ocean sunset, warm amber reflection, atmospheric horizon haze, slow cinematic tracking shot port beam, maritime physics water, broadcast quality, photorealistic', params: ['DOS_MaritimeDaylight_v1','3400K Coastal','f/7.1 Deep','Tracking','Maritime LoRA ON','Quality: 8.0'] },
          { label: 'Shot 02 / 03 — MS Deck Orbit', prompt: 'Luxury yacht deck lifestyle, golden sunset behind, talent in white linen, slow orbit, warm amber grade, shallow DOF 85mm, maritime atmosphere, cinematic broadcast quality', params: ['DOS_MaritimeDaylight_v1','3400K','f/2.0 Shallow','Orbit Slow','Maritime LoRA ON','Quality: 8.0'] },
          { label: 'Shot 03 / 03 — ECU Detail', prompt: 'Extreme close up superyacht detail, teak deck, stainless hardware, warm rim light, f/1.4 bokeh, maritime golden hour insert shot, cinematic', params: ['DOS_MaritimeDaylight_v1','3400K','f/1.4 Extreme Shallow','Static','Insert','Quality: 7.5'] },
        ],
        sss: false, hair: false, vol: true, godRays: false, maritime: true, dust: false, score: 8.0,
      },
      {
        id: 'superyacht_interior',
        name: 'Superyacht Salon Interior',
        desc: 'Luxury salon with porthole light shafts',
        tags: ['Interior','Porthole','Sacred Light'],
        shots: [
          { label: 'Shot 01 / 02 — MLS Dolly In', prompt: 'Luxury superyacht main salon interior, warm afternoon porthole light shafts on ocean, burled walnut paneling cream leather, slow dolly in, warm amber grade, atmospheric depth, premium finishes', params: ['DOS_SacredVolumetric_v1','3200K','f/5.6','Dolly In','God Rays','Quality: 8.5'] },
          { label: 'Shot 02 / 02 — MS Panels', prompt: 'Superyacht interior floating configuration panels, warm porthole light, dark luxury surround, art reveal, god ray shafts, dust particles in light', params: ['DOS_SacredVolumetric_v1','3200K + 4500K Shaft','f/8','Static','God Rays + Dust','Quality: 9.0'] },
        ],
        sss: false, hair: false, vol: true, godRays: true, maritime: false, dust: true, score: 8.7,
      },
      {
        id: 'port_arrival',
        name: 'Port Arrival — Dusk Harbour',
        desc: 'Dramatic marina arrival at blue hour',
        tags: ['Marina','Blue Hour','Reflections'],
        shots: [
          { label: 'Shot 01 / 02 — XWS Tracking', prompt: 'Luxury superyacht arriving Monaco harbour blue hour dusk, marina lights reflecting calm water, principality skyline backdrop, cinematic slow tracking, atmospheric maritime photography, broadcast quality', params: ['DOS_MaritimeDaylight_v1','Blue Hour','f/7.1 Deep','Tracking Left','Maritime LoRA ON','Quality: 8.0'] },
          { label: 'Shot 02 / 02 — MLS Crane Down', prompt: 'Superyacht marina berth dusk, gangway deployment, warm interior lights through windows, water reflections, premium maritime lifestyle, crane down reveal', params: ['DOS_MaritimeDaylight_v1','Blue Hour','f/7.1','Crane Down','Maritime LoRA ON','Quality: 8.0'] },
        ],
        sss: false, hair: false, vol: false, godRays: false, maritime: true, dust: false, score: 8.0,
      },
    ],
    luxury_branding: [
      {
        id: 'hero_portrait_reveal',
        name: 'Hero Portrait — SSS Reveal',
        desc: 'Benchmark-match ECU with SSS skin (seq_01 inspired)',
        tags: ['SSS','f/1.4','Teal-Orange','seq_01'],
        shots: [
          { label: 'Shot 01 / 03 — ECU Micro Push', prompt: 'Extreme close up luxury brand female portrait, golden hour warm amber rim back-light upper-right, soft Rembrandt key upper-left, f/1.4 razor focus eye plane, circular bokeh amber orbs, subsurface scattering skin pink glow, individual hair strand rim separation, teardrop catchlight eye, teal-orange LUT, ultra subtle micro push, 3200K warm tungsten, cinematic broadcast quality', params: ['DOS_TungstenWarm_v1','3200K','f/1.4 Extreme Shallow','Micro Push','SSS ON','Catchlight','Quality: 8.5'] },
          { label: 'Shot 02 / 03 — MCU Static', prompt: 'Cinematic MCU profile portrait luxury talent white strapless dress, dramatic 3/4 side lighting 3000K candlelight key, fill ratio 6:1, warm hair rim separation, raised index finger gesture discovery, shallow DOF f/2.0, defocused warm interior background', params: ['DOS_CandlelightFilm_v1','3000K','f/2.0 Shallow','Static','SSS ON','Hair Rim','Quality: 8.0'] },
          { label: 'Shot 03 / 03 — MS Panels', prompt: 'Luxury brand talent viewing three floating illuminated artwork panels, self-illuminated light-box panels triptych, dark warm amber studio surround, cool neutral panel light on profile, warm amber hair back-light, medium shot 35mm, bespoke selection concept', params: ['DOS_TungstenWarm_v1','2800K + 5500K Panels','f/2.8–f/4 Moderate','Static','Panel Triptych','Quality: 8.5'] },
        ],
        sss: true, hair: true, vol: false, godRays: false, maritime: false, dust: false, score: 8.5,
      },
      {
        id: 'product_reveal_touch',
        name: 'Product Reveal — Touch Activation',
        desc: 'Magical energy VFX from fingertip (seq_10 inspired)',
        tags: ['VFX Energy','Self-Illuminated','seq_10'],
        shots: [
          { label: 'Shot 01 / 03 — INSERT Static', prompt: 'Magical energy discharge fingertip touching luxury product, white particle energy filaments, self-illuminated light from hand to object, subsurface scattering skin knuckle, particle sparks scatter, dark warm amber studio, close-up insert 85mm, luxury reveal', params: ['DOS_CandlelightFilm_v1','3000K + VFX 6500K','f/2.8 Shallow','Static','VFX Energy ON','SSS Hand','Quality: 8.0'] },
          { label: 'Shot 02 / 03 — CU Micro Push', prompt: 'Luxury product hero close-up 100mm macro, self-illuminated by light energy, shallow DOF f/2.8, warm amber grade, premium craftsmanship detail, subsurface material glow, cinematic reveal', params: ['DOS_CandlelightFilm_v1','3000K','f/2.8 Macro','Micro Push','Self-Illuminated','Quality: 8.0'] },
          { label: 'Shot 03 / 03 — MCU Dolly Back', prompt: 'Slow reveal dolly back from luxury product to talent MCU, talent examining product with wonder, warm amber candlelight grade, shallow DOF, luxury brand atmosphere, broadcast quality', params: ['DOS_CandlelightFilm_v1','3000K','f/2.0 Shallow','Dolly Back','Candlelight','Quality: 8.0'] },
        ],
        sss: true, hair: false, vol: false, godRays: false, maritime: false, dust: false, score: 8.2,
      },
      {
        id: 'bespoke_configurator',
        name: 'Bespoke Configurator Panels',
        desc: 'Floating triptych selection panels (seq_13 inspired)',
        tags: ['Triptych','Panel Reveal','seq_13'],
        shots: [
          { label: 'Shot 01 / 03 — MS Static', prompt: 'Luxury talent profile right frame viewing three floating self-illuminated option panels, dark warm amber studio 2800K, cool neutral panel light 5500K, panel glow halo, triptych composition, warm hair back-light, 35mm, depth of field bokeh background', params: ['DOS_TungstenWarm_v1','2800K + 5500K Panels','f/2.8–f/4','Static','Panel Triptych','Quality: 8.5'] },
          { label: 'Shot 02 / 03 — MLS God Rays', prompt: 'Three floating illuminated luxury panels alone in room, dramatic god ray light shafts from upper right window, warm amber interior walls, dust particles in light, divine light on floating panels, medium long shot 24mm, sacred gallery atmosphere, no talent', params: ['DOS_SacredVolumetric_v1','3200K + 4500K Shaft','f/7.1 Deep','Static','God Rays + Dust','Quality: 9.0'] },
          { label: 'Shot 03 / 03 — MS Dolly In', prompt: 'Slow dolly into bespoke luxury configuration selection, talent examining floating panels, magical gesture interaction, warm amber candlelight, luxury studio atmosphere', params: ['DOS_TungstenWarm_v1','3200K','f/2.8','Dolly In','Warm Haze','Quality: 8.0'] },
        ],
        sss: true, hair: true, vol: true, godRays: true, maritime: false, dust: true, score: 8.7,
      },
    ],
  };

  let activeIndustry = 'commercial_real_estate';
  let activePresetId = 'penthouse_golden_hour';
  let activeShotIdx  = 0;

  function renderPresets() {
    const items = PRESETS[activeIndustry] || [];
    compPresets.innerHTML = items.map(p => `
      <div class="comp-preset-card ${p.id === activePresetId ? 'active' : ''}" data-preset="${p.id}">
        <div class="cpc-name">${p.name}</div>
        <div class="cpc-desc">${p.desc}</div>
        <div class="cpc-tags">${p.tags.map(t => `<span class="cpc-tag">${t}</span>`).join('')}</div>
      </div>
    `).join('');

    compPresets.querySelectorAll('.comp-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        activePresetId = card.dataset.preset;
        activeShotIdx  = 0;
        renderPresets();
        renderPrompt();
      });
    });
  }

  function renderPrompt() {
    const presets = PRESETS[activeIndustry] || [];
    const preset  = presets.find(p => p.id === activePresetId) || presets[0];
    if (!preset) return;

    const shot = preset.shots[activeShotIdx] || preset.shots[0];

    // Meta
    compMeta.textContent = `Preset: ${preset.name} · Mode: Cinema · ${preset.shots.length} shots × 5s`;

    // Shot label + prompt
    if (cpbShotLabel) cpbShotLabel.textContent = shot.label;
    compPromptText.textContent = shot.prompt;

    // Params
    if (cpbParams) {
      cpbParams.innerHTML = shot.params.map(p => `<span class="cpm-tag">${p}</span>`).join('');
    }

    // Quality signals
    const sigs = [
      { key: 'sss',     label: 'SSS',     title: 'Subsurface Scattering',    val: preset.sss },
      { key: 'hair',    label: 'Hair',    title: 'Hair Strand Detail',       val: preset.hair },
      { key: 'vol',     label: 'Vol',     title: 'Volumetric Light',         val: preset.vol },
      { key: 'godRays', label: 'God Rays',title: 'God Ray Shafts',           val: preset.godRays },
      { key: 'maritime',label: 'Maritime',title: 'Maritime Water Reflections',val: preset.maritime },
      { key: 'dust',    label: 'Dust',    title: 'Dust Particle Scatter',    val: preset.dust },
    ];
    cqSignals.innerHTML = sigs.map(s =>
      `<div class="cq-sig ${s.val ? 'on' : 'off'}" title="${s.title}">${s.label}</div>`
    ).join('');

    // Score
    cqScoreVal.textContent = preset.score.toFixed(1);
    cqScoreFill.style.width = `${(preset.score / 10) * 100}%`;

    // Shot cycle — click prompt to advance
    compPromptText.style.cursor = 'pointer';
    compPromptText.title = 'Click to see next shot';
    compPromptText.onclick = () => {
      activeShotIdx = (activeShotIdx + 1) % preset.shots.length;
      renderPrompt();
    };
  }

  // Industry buttons
  document.querySelectorAll('.comp-ind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.comp-ind-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeIndustry = btn.dataset.industry;
      activePresetId = Object.keys(PRESETS[activeIndustry] || {})[0] || '';
      activeShotIdx  = 0;
      renderPresets();
      renderPrompt();
    });
  });

  // Copy button
  compCopy?.addEventListener('click', () => {
    const text = compPromptText.textContent;
    navigator.clipboard?.writeText(text).then(() => {
      compCopy.textContent = 'Copied ✓';
      compCopy.classList.add('copied');
      setTimeout(() => { compCopy.textContent = 'Copy Prompt'; compCopy.classList.remove('copied'); }, 2000);
    });
  });

  // Initialise
  renderPresets();
  renderPrompt();
})();

// ══════════════════════════════════════════════════════════════
// STORYBOARD VIEWER — 5-scene marine/real estate cinematic sequence
// "Superyacht at Dusk" — interactive scene navigator
// ══════════════════════════════════════════════════════════════
(function storyboardViewer() {
  const SCENES = [
    {
      badge:      'Scene 01 / 05',
      title:      'Superyacht at Dusk — Aerial Establish',
      desc:       'Wide aerial establishing shot of a 55m superyacht underway at golden hour, warm amber ocean horizon, atmospheric coastal haze. Slow crane upward reveals the full vessel against a dramatic sunset sky. Maritime LoRA physics-accurate water reflections.',
      duration:   '5s · 120 frames',
      shot:       'XWS · 24mm · f/7.1',
      lut:        'DOS_MaritimeDaylight_v1',
      score:      '8.5 / 10',
      camMotion:  'Crane Up',
      signals:    { sss: true, hair: true, vol: true, god: false, bloom: true, id: false },
      prompt:     'luxury superyacht 55m motor yacht underway open ocean golden hour dusk, XWS aerial establishing shot 24mm f/7.1, warm amber golden light 3400K coastal sunset, physics-accurate ocean wave reflections maritime LoRA, atmospheric horizon haze, dramatic sky warm gradients, slow crane upward reveal full vessel, broadcast quality cinematic photorealistic, no people on deck, deep focus f/7.1...',
    },
    {
      badge:      'Scene 02 / 05',
      title:      'Beam Profile — Port Tracking Shot',
      desc:       'Cinematic tracking shot from a chase vessel at beam level. The superyacht moves gracefully through the frame, warm amber light catching the hull polish, teak deck detail sharp in the foreground. Maritime LoRA prevents jelly-water artifacts.',
      duration:   '5s · 120 frames',
      shot:       'XWS · 50mm · f/4.0',
      lut:        'DOS_MaritimeDaylight_v1',
      score:      '8.0 / 10',
      camMotion:  'Tracking Left',
      signals:    { sss: false, hair: false, vol: true, god: false, bloom: true, id: true },
      prompt:     'luxury superyacht beam profile tracking shot at water level 50mm f/4, slow cinematic tracking left to right, vessel underway calm ocean golden hour, warm amber hull reflection in water, teak deck detail sharp, stainless steel fittings gleam, atmospheric sea spray haze, physics-accurate wave simulation maritime LoRA, warm 3400K coastal light, photorealistic broadcast quality...',
    },
    {
      badge:      'Scene 03 / 05',
      title:      'Teak Deck Detail — ECU Insert',
      desc:       'Extreme close-up insert shot of premium teak decking, brushed stainless hardware, and polished hull surface. Warm afternoon rim light catches material detail. Shallow depth of field with cinematic bokeh on ocean background.',
      duration:   '5s · 120 frames',
      shot:       'ECU · 85mm · f/1.4',
      lut:        'DOS_TungstenWarm_v1',
      score:      '8.0 / 10',
      camMotion:  'Static',
      signals:    { sss: false, hair: false, vol: false, god: false, bloom: true, id: false },
      prompt:     'extreme close up luxury yacht teak deck ECU 85mm f/1.4, premium teak wood grain warm golden light, brushed 316L marine grade stainless steel cleats fittings, polished chrome highlights, warm afternoon rim light upper-right, razor shallow DOF f/1.4 bokeh ocean background, premium materials surface detail, micro-imperfection texture realism, warm amber 3200K, broadcast quality cinematic...',
    },
    {
      badge:      'Scene 04 / 05',
      title:      'Main Salon Interior — God Ray Reveal',
      desc:       'Luxury main salon interior reveal. Warm porthole light shafts cascade across burled walnut panelling and cream leather seating. Sacred volumetric atmosphere with dust particles in golden light beams. Slow dolly forward into the space.',
      duration:   '9s · 216 frames',
      shot:       'MLS · 24mm · f/5.6',
      lut:        'DOS_SacredVolumetric_v1',
      score:      '8.5 / 10',
      camMotion:  'Dolly In',
      signals:    { sss: false, hair: false, vol: true, god: true, bloom: true, id: true },
      prompt:     'luxury superyacht main salon interior MLS 24mm f/5.6, warm porthole afternoon light shafts 3200K, burled walnut panelling dark warm, cream leather seating, god ray light shafts from port portholes upper right, dust particles floating in golden light beams, sacred atmosphere, slow dolly forward into space, premium marine finishes, warm teal-orange LUT, DOS_SacredVolumetric_v1, cinematic broadcast quality...',
    },
    {
      badge:      'Scene 05 / 05',
      title:      'Hero Aerial — Horizon Pull-Back',
      desc:       'Final hero shot: slow crane upward aerial pull-back reveals the full vessel against a vast ocean horizon at golden hour. The perfect establishing close to a cinematic vessel production.',
      duration:   '10s · 240 frames',
      shot:       'XWS · 16mm · f/11',
      lut:        'DOS_MaritimeDaylight_v1',
      score:      '9.0 / 10',
      camMotion:  'Crane Up + Dolly Back',
      signals:    { sss: false, hair: false, vol: true, god: true, bloom: true, id: true },
      prompt:     'hero aerial cinematic shot superyacht open ocean XWS 16mm f/11, slow crane upward and dolly back reveals full vessel against vast ocean horizon, golden hour warm amber 3400K, epic sky warm gradients, physics-accurate ocean surface maritime LoRA, atmospheric coastal haze god rays from horizon, vessel silhouette against dramatic sunset, broadcast quality cinematic photorealistic, warm romantic tone...',
    },
  ];

  const SIG_KEYS   = ['sss', 'hair', 'vol', 'god', 'bloom', 'id'];
  const SIG_LABELS = { sss: 'Maritime LoRA', hair: 'Ocean Physics', vol: 'Vol. Haze', god: 'God Rays', bloom: 'Golden Hour', id: 'Interior Lock' };

  let currentScene = 0;

  const tl       = document.querySelectorAll('.sbt-scene');
  const frames   = document.querySelectorAll('.sb-vis-frame');
  const pdots    = document.querySelectorAll('.sb-pdot');
  const prevBtn  = document.getElementById('sbPrev');
  const nextBtn  = document.getElementById('sbNext');

  if (!tl.length) return;

  function updateScene(idx) {
    currentScene = idx;
    const s = SCENES[idx];

    // Timeline
    tl.forEach((t, i) => t.classList.toggle('active', i === idx));
    // Frames
    frames.forEach((f, i) => f.classList.toggle('active', i === idx));
    // Progress dots
    pdots.forEach((d, i) => d.classList.toggle('active', i === idx));

    // Text fields
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText('sbSceneBadge', s.badge);
    setText('sbSceneTitle', s.title);
    setText('sbSceneDesc',  s.desc);
    setText('sbDuration',   s.duration);
    setText('sbShot',       s.shot);
    setText('sbLut',        s.lut);
    setText('sbScore',      s.score);
    setText('sbCamText',    s.camMotion);
    setText('sbPromptText', s.prompt);

    // Score colour
    const scoreEl = document.getElementById('sbScore');
    if (scoreEl) {
      const num = parseFloat(s.score);
      scoreEl.style.color = num >= 9 ? '#FFD700' : 'var(--rose)';
    }

    // Quality signals
    SIG_KEYS.forEach(key => {
      const el = document.getElementById(`sbSig_${key}`);
      if (el) {
        const on = s.signals[key];
        el.className = `sb-sig ${on ? 'on' : 'off'}`;
        el.textContent = SIG_LABELS[key];
      }
    });

    // Navigation buttons
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) nextBtn.disabled = idx === SCENES.length - 1;
  }

  // Timeline click
  tl.forEach((dot, i) => dot.addEventListener('click', () => updateScene(i)));

  // Arrow buttons
  prevBtn?.addEventListener('click', () => { if (currentScene > 0) updateScene(currentScene - 1); });
  nextBtn?.addEventListener('click', () => { if (currentScene < SCENES.length - 1) updateScene(currentScene + 1); });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    const sb = document.getElementById('storyboard');
    if (!sb) return;
    const rect = sb.getBoundingClientRect();
    const inView = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inView) return;
    if (e.key === 'ArrowRight' && currentScene < SCENES.length - 1) updateScene(currentScene + 1);
    if (e.key === 'ArrowLeft'  && currentScene > 0)                 updateScene(currentScene - 1);
  });

  // Initialise
  updateScene(0);
})();

// ══════════════════════════════════════════════════════════════
// SCALABILITY ARCHITECTURE — animated counters on scroll
// ══════════════════════════════════════════════════════════════
(function scaleAnimations() {
  const metrics = document.querySelectorAll('.sc-met-val');
  if (!metrics.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      // Subtle scale-in for feature cards
      entry.target.closest('.sc-feat-card')?.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.sc-feat-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    const inner = card.querySelector('h4') || card;
    observer.observe(inner);
  });

  const featObs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      featObs.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.sc-feat-card').forEach((card, i) => {
    card.style.transitionDelay = `${i * 60}ms`;
    featObs.observe(card);
  });

  // Architecture node hover highlight effect
  document.querySelectorAll('.sc-node').forEach(node => {
    node.addEventListener('mouseenter', () => {
      node.style.background = 'rgba(240,144,144,0.05)';
    });
    node.addEventListener('mouseleave', () => {
      node.style.background = '';
    });
  });
})();

// ══════════════════════════════════════════════════════════════
// AI INTELLIGENCE LIVE FEED — v1.3.0
// Simulates the Perceive→Reason→Act→Learn quality loop in the browser
// ══════════════════════════════════════════════════════════════
(function initAgenticFeed() {
  const feed       = document.getElementById('agLiveFeed');
  const healthEl   = document.getElementById('agHealthScore');
  if (!feed) return;

  // Mock system state (in production: SSE from /api/v1/admin/agentic/status)
  const systemState = {
    healthScore: 0.982,
    qaScore: 8.5,
    queueDepth: 0,
    cdnLatencyMs: 42,
    costPerJob: 0.62,
    adaptations: 0,
    episodes: 0,
  };

  const ADAPTATION_SCENARIOS = [
    { type: 'PERCEIVE', badge: 'info', cls: 'ag-feed-info',
      texts: [
        () => `QA score ${(systemState.qaScore).toFixed(1)}/10 · Queue ${systemState.queueDepth} · CDN ${systemState.cdnLatencyMs}ms · Health ${(systemState.healthScore * 100).toFixed(1)}%`,
        () => `Marine & real estate pipelines nominal — Kling API healthy · Cost $${systemState.costPerJob.toFixed(2)}/job · 0 HITL alerts`,
      ] },
    { type: 'REASON', badge: 'nominal', cls: 'ag-feed-nominal',
      texts: [
        () => `Quality loop: ${systemState.queueDepth} issues detected. System health ${(systemState.healthScore*100).toFixed(1)}% — no critical adaptation needed.`,
        () => 'Policy check: best known strategies loaded. Thresholds nominal across all 5 quality signal types.',
      ] },
    { type: 'ACT', badge: 'act', cls: 'ag-feed-act',
      texts: [
        () => 'Proactive: Maritime LoRA + volumetric benchmark anchors injected into all active Kling prompts.',
        () => 'Proactive: CDN cache TTL extended for static assets. Geo-routing verified optimal.',
        () => `Smart batching enabled — ${systemState.adaptations + 1} cost-savings cycles completed.`,
      ],
      onFire: () => {
        systemState.adaptations++;
        systemState.costPerJob = Math.max(0.42, systemState.costPerJob - 0.04);
        systemState.qaScore    = Math.min(9.2, systemState.qaScore + 0.05);
      } },
    { type: 'LEARN', badge: 'learn', cls: 'ag-feed-success',
      texts: [
        () => `Episode ${systemState.episodes + 1} stored — policy weights updated. Prompt enrichment success rate: 94%.`,
        () => `Learned: QA improvement ${(systemState.qaScore).toFixed(1)}/10 after benchmark anchor injection. Retaining strategy.`,
      ],
      onFire: () => { systemState.episodes++; } },
  ];

  function formatTime(d) {
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${m}:${s}`;
  }

  function appendFeedItem(type, badge, cls, text) {
    const item = document.createElement('div');
    item.className = `ag-feed-item ${cls}`;
    item.innerHTML = `
      <span class="ag-feed-time">${formatTime(new Date())}</span>
      <span class="ag-feed-badge ${badge}">${type}</span>
      <span class="ag-feed-text">${text}</span>`;
    feed.insertBefore(item, feed.firstChild);
    // Keep max 12 items
    while (feed.children.length > 12) feed.removeChild(feed.lastChild);
  }

  function runFeedCycle() {
    // Simulate slight fluctuations
    systemState.queueDepth   = Math.max(0, systemState.queueDepth + Math.floor(Math.random() * 5 - 2));
    systemState.cdnLatencyMs = Math.max(28, systemState.cdnLatencyMs + Math.floor(Math.random() * 20 - 10));
    systemState.healthScore  = Math.min(0.999, Math.max(0.92, systemState.healthScore + (Math.random() - 0.5) * 0.01));

    // Update health badge
    const pct = (systemState.healthScore * 100).toFixed(1);
    if (healthEl) {
      healthEl.textContent = pct + '%';
      healthEl.style.color = systemState.healthScore > 0.95 ? '#4caf7d'
        : systemState.healthScore > 0.85 ? '#f5a623' : '#c43a4a';
    }

    // Pick scenario: weighted toward PERCEIVE + REASON (more common)
    const roll = Math.random();
    let scenario;
    if (roll < 0.40)      scenario = ADAPTATION_SCENARIOS[0]; // PERCEIVE
    else if (roll < 0.70) scenario = ADAPTATION_SCENARIOS[1]; // REASON
    else if (roll < 0.90) scenario = ADAPTATION_SCENARIOS[2]; // ACT
    else                   scenario = ADAPTATION_SCENARIOS[3]; // LEARN

    const texts = scenario.texts;
    const text  = texts[Math.floor(Math.random() * texts.length)]();
    if (scenario.onFire) scenario.onFire();

    appendFeedItem(scenario.type, scenario.badge, scenario.cls, text);
  }

  // Run first cycle after 3s, then every 8s
  setTimeout(runFeedCycle, 3000);
  setInterval(runFeedCycle, 8000);

  // Animate strategy cards entrance on scroll
  const stratCards = document.querySelectorAll('.ag-strategy-card, .ag-loop-card');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.style.opacity = '1';
          e.target.style.transform = 'translateY(0)';
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    stratCards.forEach((c, i) => {
      c.style.opacity = '0';
      c.style.transform = 'translateY(20px)';
      c.style.transition = `opacity 0.5s ${i * 0.07}s, transform 0.5s ${i * 0.07}s`;
      io.observe(c);
    });
  }
})();

// ── Console brand ─────────────────────────────────────────────
console.log(
  '%c DesignOS · Bluebird v1.7 ',
  'background:#F09090;color:#fff;padding:4px 12px;border-radius:4px;font-weight:700;',
  '\nCinematic Generation Engine · Marine & Real Estate\nPowered by Kling 3.0 + Genspark AI · Ready',
  '\nBenchmark calibrated: hf_20260322_125816 · 8.5/10 composite',
  '\n"Superyacht at Dusk" · 5-Scene Marine Sequence · v1.3.0',
  '\nAI Intelligence L3: Perceive→Reason→Act→Learn · v1.3.0'
);
