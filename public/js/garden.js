/**
 * garden.js — interactive ASCII garden for the home hero.
 *
 * Every plant starts DRY (withered). Dragging the pointer across the hero
 * "waters" it: droplets spray from the pointer, and any plant touched
 * transitions dry -> bloom once (never back) and plays one note.
 *
 * Progressive enhancement: if this script or Tone.js fails to load, the hero
 * simply keeps its plain background.
 */
(function () {
  'use strict';

  var mount = document.querySelector('[data-garden]');
  if (!mount) return;

  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Deterministic RNG so the field is the same every load (mulberry32). */
  function makeRng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rand = makeRng(20260908);

  /* ----------------------------------------------------------------------
   * 1. Plant catalogue.
   *    DRY is still drawn with `white-space: pre` in a monospace face so its
   *    column positions are exact — every plant's stem sits at column 3.
   *    BLOOM is now one of Mahshid's hand-drawn flower SVGs (images/icons/
   *    garden/f*.svg, already white). Each is anchored bottom-centre on that
   *    same column-3 point, so the stem doesn't shift when a plant blooms.
   * -------------------------------------------------------------------- */
  var DRY = [['   .', 'grey'], ['   |', 'brown'], ['   |', 'brown']];

  var GARDEN_DIR = 'images/icons/garden/';
  function flower(file, w, h) { return { img: GARDEN_DIR + file, w: w, h: h }; }

  // each bloom SVG is a plain white silhouette — tinted per plant type via
  // CSS mask + background-color, using the same pl-* palette the dry/decor
  // art already defines, so the garden reads as colorful once watered.
  var PLANTS = {
    daisy:     { dry: DRY, color: 'pink',   bloom: flower('f.svg', 79, 109) },
    tulip:     { dry: DRY, color: 'yellow', bloom: flower('f3.svg', 37, 85) },
    poppy:     { dry: DRY, color: 'purple', bloom: flower('f5.svg', 43, 85) },
    blossom:   { dry: DRY, color: 'orange', bloom: flower('f4.svg', 54, 105) },
    sunflower: { dry: DRY, color: 'blue',   bloom: flower('f1.svg', 74, 109) },
    wisteria:  { dry: DRY, color: 'green',  bloom: flower('f6.svg', 49, 89) },
    spiky:     { dry: DRY, color: 'pink',   bloom: flower('f7.svg', 46, 113) },
    cluster:   { dry: DRY, color: 'yellow', bloom: flower('f2.svg', 43, 87) },
    sprout:    { dry: DRY, color: 'purple', bloom: flower('f8.svg', 48, 89) },
    berry:     { dry: DRY, color: 'orange', bloom: flower('f2.svg', 43, 87) }
  };
  var PLANT_KEYS = Object.keys(PLANTS);

  // column-3 in the dry monospace art, in px — the shared anchor that both
  // the dry stem and the bloom SVG centre on.
  var STEM_X = 18;

  /* ----------------------------------------------------------------------
   * 2. Placement — a dense jittered grid across the 1440 x 1117 hero box.
   * Below 1440px this frame IS the viewport, unchanged from the original
   * design. On a wider monitor, everything here (positions, the edge
   * bands, the headline's clear zone) is expressed as a % of FRAME_W —
   * widening FRAME_W to match the real viewport doesn't just stretch the
   * same fixed count of flowers thinner across the extra space, it seeds
   * more columns to fill it, so the bed reads full and centred instead of
   * bunched toward the left with empty space on the right.
   * Capped at 2200px: past that, more columns stop helping the eye and
   * just balloon the element count (uncapped, a 7680px display seeds
   * ~2000 flowers vs. 282 at the 1440px design width) — real risk of
   * choking layout/paint on an actual machine. Past the cap the field
   * just centers with real (much smaller, no longer empty-looking) margins
   * on each side instead of continuing to widen. */
  var FRAME_W = Math.min(2200, Math.max(1440, window.innerWidth));
  var FRAME_H = 1117;

  var GARDEN = [];
  var SPRIGS = [];
  var TUFTS = [];

  /* The garden wraps AROUND the headline: a hard clear zone over and behind
   * the text, dense flowers packed on the sides and below it. The bed ends
   * at the bottom of the hero itself — no scatter trailing into the next
   * section, since those plants sat behind the intro copy and couldn't be
   * watered (the copy was on top and ate the clicks). */
  var BAND_TOP = FRAME_H * 0.26;    // nothing (except side vines) above this
  var BED_BOTTOM = FRAME_H * 0.98;  // dense bed ends around here...
  var GROUND = BED_BOTTOM;          // ...and stops there, flush with the hero
  var CX = FRAME_W / 2;
  var TEXT_CY = FRAME_H * 0.42;
  var CLEAR_RX = 470;               // half-width of the clear zone around the text
  var CLEAR_RY = 235;               // half-height (covers above + behind the text)

  function density(x, y) {
    var edge = (x < 260 || x > FRAME_W - 260) ? 1 : 0;

    // hard clear ellipse around the headline (with a short feathered edge)
    var cx = (x - CX) / CLEAR_RX;
    var cy = (y - TEXT_CY) / CLEAR_RY;
    var clear = cx * cx + cy * cy;
    if (clear < 1) return 0;

    if (y < BAND_TOP) {
      // above the bed — only the edge vines, fading out as they climb
      var climb = (y - FRAME_H * 0.10) / (BAND_TOP - FRAME_H * 0.10);
      var pv = edge ? Math.max(0, 0.85 * climb) : 0;
      return clear < 1.4 ? pv * ((clear - 1) / 0.4) : pv;
    }

    var t = (y - BAND_TOP) / (BED_BOTTOM - BAND_TOP);   // 0 at bed top .. 1 at bed bottom
    var p = 0.66 + 0.30 * Math.min(t, 1);               // dense, packed low
    if (edge) p += 0.20;                                // sides really filled out

    // past the bed bottom: fall off fast + jaggedly so the edge is messy
    if (y > BED_BOTTOM) {
      var f = 1 - (y - BED_BOTTOM) / (GROUND - BED_BOTTOM);   // 1 -> 0
      p *= f * f * (0.6 + 0.8 * rand());                      // random bite = ragged
    }

    if (clear < 1.4) p *= (clear - 1) / 0.4;           // feather just outside the clear zone
    return p < 0 ? 0 : (p > 0.99 ? 0.99 : p);
  }

  var X_MIN = 24, X_MAX = FRAME_W - 66;   // keep plant boxes inside the frame

  (function seed() {
    var stepX = 50, stepY = 42, jx = 20, jy = 16;
    var row = 0;
    for (var y = FRAME_H * 0.08; y < GROUND; y += stepY, row++) {
      var offset = row % 2 ? stepX / 2 : 0;
      for (var x = X_MIN + offset; x < X_MAX; x += stepX) {
        var p = density(x, y);
        if (rand() >= p) continue;
        // more vertical scatter the lower we go = messier bottom edge
        var jyEff = jy + (y > BED_BOTTOM ? 46 : (y > BED_BOTTOM - 140 ? 22 : 0));
        var px = Math.round(Math.min(X_MAX, Math.max(X_MIN, x + (rand() * 2 - 1) * jx)));
        var py = Math.round(y + (rand() * 2 - 1) * jyEff);
        var kind = rand();
        if (kind < 0.88) {
          GARDEN.push([PLANT_KEYS[(rand() * PLANT_KEYS.length) | 0], px, py]);
        } else if (kind < 0.95) {
          SPRIGS.push([px, py]);
        } else {
          TUFTS.push([px, py, 5 + ((rand() * 12) | 0)]);
        }
      }
    }
  })();

  /* ----------------------------------------------------------------------
   * 3. Sound — the flowers play a MELODY, not fixed pitches. Each flower you
   *    water sounds the next note of MELODY; a new drag restarts the phrase.
   *    Swap MELODY for any note sequence; swap the synth block for a
   *    different timbre (or a Tone.Sampler loading your own audio files).
   * -------------------------------------------------------------------- */
  // still E Lydian (E F# G# A# B C# D#), leaning on its relative-minor
  // colour (G#) as the phrase's centre of gravity. First half resolves
  // downward instead of up for a melancholic contour; second half echoes
  // the same shape an octave lower, like it's fading out, settling on the
  // tonic (E) at the very end instead of just repeating from the top.
  var MELODY = [
    'C#5', 'B4', 'G#4', 'F#4', 'E4', 'F#4', 'G#4', 'B4',
    'A#4', 'G#4', 'F#4', 'D#4', 'C#4', 'B3', 'G#3', 'E3',
    'C#4', 'B3', 'G#3', 'F#3', 'E3', 'F#3', 'G#3', 'B3',
    'A#3', 'G#3', 'F#3', 'D#3', 'C#3', 'B2', 'G#2', 'E2'
  ];
  var melodyIdx = 0;

  var synth = null;
  var audioReady = false;

  function initAudio() {
    if (audioReady || !window.Tone) return;
    audioReady = true;
    try {
      var T = window.Tone;
      var reverb = new T.Reverb({ decay: 3.5, wet: 0.4 }).toDestination();
      var delay = new T.FeedbackDelay({ delayTime: '8n.', feedback: 0.22, wet: 0.18 }).connect(reverb);
      // music-box / celesta-ish tone
      synth = new T.PolySynth(T.FMSynth, {
        harmonicity: 3,
        modulationIndex: 12,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.3 },
        modulation: { type: 'square' },
        modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0, release: 0.1 },
        volume: -13
      }).connect(delay);
    } catch (e) {
      synth = null;
    }
  }

  function playNextNote() {
    if (!synth) return;
    var note = MELODY[melodyIdx % MELODY.length];
    melodyIdx++;
    try {
      synth.triggerAttackRelease(note, 1.0, undefined, 0.6);
    } catch (e) { /* ignore audio hiccups */ }
  }

  /* ----------------------------------------------------------------------
   * 4. Render
   * -------------------------------------------------------------------- */
  function artEl(rows, kind) {
    var art = document.createElement('div');
    art.className = 'plant-art plant-' + kind;
    for (var i = 0; i < rows.length; i++) {
      var span = document.createElement('span');
      span.className = 'pl pl-' + rows[i][1];
      span.textContent = rows[i][0];
      art.appendChild(span);
    }
    return art;
  }

  function bloomEl(bloom, color) {
    // the SVG is a plain white silhouette; used as a CSS mask over a
    // coloured div so it tints to `color` instead of rendering flat white
    var el = document.createElement('div');
    el.className = 'plant-art plant-bloom pl-' + color;
    el.setAttribute('aria-hidden', 'true');
    el.style.width = bloom.w + 'px';
    el.style.height = bloom.h + 'px';
    el.style.left = (STEM_X - bloom.w / 2) + 'px';
    el.style.webkitMaskImage = 'url(' + bloom.img + ')';
    el.style.maskImage = 'url(' + bloom.img + ')';
    return el;
  }

  function place(el, x, y) {
    el.style.left = (x / FRAME_W * 100) + '%';
    el.style.top = (y / FRAME_H * 100) + '%';
  }

  var plantEls = [];

  function buildGarden() {
    var frag = document.createDocumentFragment();

    SPRIGS.forEach(function (p) {
      var d = document.createElement('img');
      d.className = 'garden-decor garden-decor--sprig';
      d.src = GARDEN_DIR + 'grass-2.svg';
      d.alt = '';
      d.draggable = false;
      place(d, p[0], p[1]);
      frag.appendChild(d);
    });
    TUFTS.forEach(function (p) {
      var d = document.createElement('img');
      d.className = 'garden-decor garden-decor--tuft';
      d.src = GARDEN_DIR + 'grass-1.svg';
      d.alt = '';
      d.draggable = false;
      d.style.width = (26 + p[2] * 4) + 'px';
      place(d, p[0], p[1]);
      frag.appendChild(d);
    });

    // plants ordered by x for the ascending-scale mapping
    var ordered = GARDEN.map(function (g, i) { return { g: g, i: i }; })
      .sort(function (a, b) { return a.g[1] - b.g[1]; });

    ordered.forEach(function (item, col) {
      var def = PLANTS[item.g[0]];
      if (!def) return;
      var el = document.createElement('div');
      el.className = 'garden-plant';
      el.dataset.plant = item.g[0];
      el.appendChild(artEl(def.dry, 'dry'));
      el.appendChild(bloomEl(def.bloom, def.color));
      place(el, item.g[1], item.g[2]);
      el._bloomed = false;
      plantEls.push(el);
      frag.appendChild(el);
    });

    mount.appendChild(frag);
  }

  function bloom(el) {
    if (!el || el._bloomed) return;
    el._bloomed = true;
    el.classList.add('is-bloomed');
    playNextNote();
  }

  /* ----------------------------------------------------------------------
   * 5. Water droplets
   * -------------------------------------------------------------------- */
  var DROP_CHARS = ['.', "'", '\\', 'o', ','];

  function spray(x, y, count) {
    var oy = y - 6;
    for (var i = 0; i < count; i++) {
      var drop = document.createElement('span');
      drop.className = 'water-drop';
      drop.textContent = DROP_CHARS[(Math.random() * DROP_CHARS.length) | 0];
      drop.style.left = x + 'px';
      drop.style.top = oy + 'px';
      document.body.appendChild(drop);

      var ang = (-70 + Math.random() * 40) * Math.PI / 180;
      var dist = 16 + Math.random() * 30;
      var dx = Math.cos(ang) * dist * 0.6;
      var dy = Math.abs(Math.sin(ang) * dist) + 12;
      if (reduceMotion) { dx *= 0.4; dy *= 0.4; }

      (function (node, tx, ty) {
        requestAnimationFrame(function () {
          node.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
          node.style.opacity = '0';
        });
        setTimeout(function () { node.remove(); }, 650);
      })(drop, dx, dy);
    }
  }

  /* ----------------------------------------------------------------------
   * 6. Drag-to-water interaction
   * -------------------------------------------------------------------- */
  var watering = false;
  var lastTick = 0;
  var THROTTLE = 55;

  // radius (px) a drag can miss a plant's own small hitbox by and still
  // water it — a fast/imprecise real drag easily lands a few px off a
  // 56x62 box, and elementFromPoint alone gave up entirely in that case
  var NEAR_RADIUS = 34;

  function plantAt(x, y) {
    var node = document.elementFromPoint(x, y);
    var hit = node ? node.closest('.garden-plant') : null;
    if (hit) return hit;

    // fall back to proximity: nearest not-yet-bloomed plant within reach
    var best = null, bestDist = NEAR_RADIUS;
    for (var i = 0; i < plantEls.length; i++) {
      var el = plantEls[i];
      if (el._bloomed) continue;
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var d = Math.hypot(x - cx, y - cy);
      if (d < bestDist) { bestDist = d; best = el; }
    }
    return best;
  }

  function startWater(e) {
    if (e.button != null && e.button !== 0) return;
    initAudio();
    if (window.Tone && window.Tone.start) {
      try { window.Tone.start(); } catch (err) { /* no-op */ }
    }
    watering = true;
    lastTick = 0;
    melodyIdx = 0;            // each new drag starts the phrase from the top
    e.preventDefault();
    dismissHint();
    spray(e.clientX, e.clientY, 9);
    bloom(plantAt(e.clientX, e.clientY));
  }

  function moveWater(e) {
    if (!watering) return;
    var now = e.timeStamp || Date.now();
    if (now - lastTick < THROTTLE) return;
    lastTick = now;
    spray(e.clientX, e.clientY, 5);
    bloom(plantAt(e.clientX, e.clientY));
  }

  function endWater() { watering = false; }

  mount.addEventListener('pointerdown', startWater);
  window.addEventListener('pointermove', moveWater, { passive: true });
  window.addEventListener('pointerup', endWater);
  window.addEventListener('pointercancel', endWater);
  mount.addEventListener('pointerleave', endWater);

  /* ----------------------------------------------------------------------
   * 7. "Click and drag around" hint — appears a few seconds after load,
   *    bobs gently, and disappears the first time the garden is watered.
   * -------------------------------------------------------------------- */
  var hintEl = null;
  var hintShown = false;
  var hintDismissed = false;
  var hintTimer = null;

  function addHint() {
    if (coarse || window.innerWidth <= 820) return;
    hintEl = document.createElement('div');
    hintEl.className = 'drag-hint';
    hintEl.innerHTML = '<img class="drag-hint__icon" src="images/icons/volume-05.svg" alt="">Click and drag around!';
    (document.querySelector('.home-hero .intro-text') || document.querySelector('.home-hero') || document.body).appendChild(hintEl);
    // show as soon as the page is up (a beat for the fade-in to register)
    hintTimer = setTimeout(function () {
      if (hintDismissed) return;
      hintShown = true;
      hintEl.classList.add('is-visible');
    }, 250);
  }

  function dismissHint() {
    if (hintDismissed) return;
    hintDismissed = true;
    if (hintTimer) clearTimeout(hintTimer);
    if (!hintEl) return;
    // never remove it from the DOM — .intro-text centers vertically as a
    // flex column, so taking the hint's box out of layout shrinks that
    // column's height and re-centers it, visibly jumping the headline and
    // "Projects" link. Fading it to invisible (its space still reserved)
    // keeps that box the same height for the rest of the page's life.
    hintEl.classList.add('is-gone');
  }

  /* ----------------------------------------------------------------------
   * 8. Go
   * -------------------------------------------------------------------- */
  buildGarden();
  addHint();
})();
