/**
 * page-transition.js — cinematic black-overlay page transition + glowing
 * marker-cursor drawing layer.
 *
 * Runs on every page that shares the top nav (index.html, projects.html,
 * playground.html, AI.html). Since this is a real multi-page site (no
 * client-side router),
 * the "hold" state is handed off across the actual navigation via
 * sessionStorage: the leaving page rises + holds + shows the title, then
 * navigates; the arriving page detects the handoff flag as its very first
 * action and continues straight into the exit, so the black screen never
 * has a seam.
 *
 * ---------------------------------------------------------------------
 * CONFIG — everything a designer would want to tune lives here. Durations
 * are pushed onto CSS custom properties at init, so the CSS transitions
 * and the JS setTimeout schedule can never drift out of sync.
 * ---------------------------------------------------------------------
 */
(function () {
  'use strict';

  var CONFIG = {
    // Destination titles, keyed by the pathname's last segment (the file
    // the link's href points at). '' covers a link to "/" or "". Clean
    // URLs (firebase.json rewrites /about, /projects to the .html files)
    // are the ones links actually use now; the .html keys stay so a
    // direct/bookmarked .html link still resolves a title.
    titles: {
      'about': 'About Me',
      'index.html': 'About Me',
      '': 'About Me',
      'projects': 'Projects',
      'projects.html': 'Projects',
      'playground': 'Playground',
      'playground.html': 'Playground',
      'AI.html': 'Design Reflections'
    },

    // Timing (ms). Default schedule: 0–380 rise, title fades in as the
    // rise finishes, hold until 730, then navigate. Tune freely.
    enterMs: 380,
    holdMs: 350,
    titleFadeDelayMs: 50,   // after the rise completes
    titleFadeMs: 320,
    arrivalHoldMs: 150,     // brief hold on the new page before exiting
    exitMs: 420,
    exitTitleFadeMs: 120,

    // Touch/narrow-viewport override — same shape, much shorter. Applied
    // over the timing fields above at init time (see isMobile below).
    // Drawing is disabled on these devices entirely (see the draw engine),
    // so there's no gesture to leave time for; the overlay is here purely
    // as a quick wipe between pages.
    mobile: {
      enterMs: 180,
      holdMs: 120,
      titleFadeDelayMs: 20,
      titleFadeMs: 140,
      arrivalHoldMs: 60,
      exitMs: 200,
      exitTitleFadeMs: 80
    },

    // Easing. Enter decelerates hard (expo-out feel); exit is a smooth
    // ease-in-out continuation of the same upward motion.
    enterEase: 'cubic-bezier(0.16, 1, 0.3, 1)',
    exitEase: 'cubic-bezier(0.65, 0, 0.35, 1)',

    // A sessionStorage handoff older than this is treated as stale
    // (e.g. a bfcache restore or a much later back/forward) and ignored.
    maxHandoffAgeMs: 4000,

    // Glowing marker stroke. The visible glow/body/core layers are all
    // the same crisp accumulated stroke, composited at different blur
    // radii/alphas (see the `draw` engine below) — `width` is that crisp
    // stroke's own thickness, not the glow's visual spread; the glow
    // layer's spread comes from `glowBlur` alone.
    stroke: {
      color: '#5b6dff',       // cobalt accent, matches --color-cobaltblue
      coreColor: '#ffffff',
      width: 13,              // crisp body stroke width (px, CSS pixels)
      coreWidthRatio: 0.34,   // white-hot core stroke, relative to width
      glowBlur: 28,
      bodyBlur: 3,
      coreBlur: 1,
      glowAlpha: 0.65,
      bodyAlpha: 0.95,
      coreAlpha: 0.9,
      smoothing: 0.3,         // 0..1, lower = more lag/smoothing
      cursorSize: 16
    },

    zIndex: 100000,

    storageKey: 'pt:handoff'
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Touch input (the actual reason drawing is hard to do well) or a
  // narrow/mobile-breakpoint viewport (matching this site's own 768px
  // breakpoint in variables.css) — either counts as "mobile" here.
  // Evaluated once at load, same as reduceMotion; this isn't meant to
  // react live to mid-session resizing.
  //
  // innerWidth guard: this runs synchronously at the very top of <body>,
  // before layout has necessarily settled — a viewport that hasn't been
  // sized yet can transiently report 0, which would otherwise satisfy
  // "<= 768" and wrongly lock in the mobile config for the whole page
  // view. 0 is never a real viewport width, so treat it as inconclusive
  // and fall back to the (layout-independent) pointer check alone.
  var vw = window.innerWidth;
  var isMobile = window.matchMedia('(pointer: coarse)').matches ||
    (vw > 0 && window.matchMedia('(max-width: 768px)').matches);

  if (isMobile) {
    for (var mobileKey in CONFIG.mobile) {
      if (CONFIG.mobile.hasOwnProperty(mobileKey)) CONFIG[mobileKey] = CONFIG.mobile[mobileKey];
    }
  }

  /* ----------------------------------------------------------------------
   * DOM setup
   * -------------------------------------------------------------------- */
  var root = document.documentElement;
  root.style.setProperty('--pt-enter-ms', CONFIG.enterMs + 'ms');
  root.style.setProperty('--pt-exit-ms', CONFIG.exitMs + 'ms');
  root.style.setProperty('--pt-enter-ease', CONFIG.enterEase);
  root.style.setProperty('--pt-exit-ease', CONFIG.exitEase);
  root.style.setProperty('--pt-title-fade-ms', CONFIG.titleFadeMs + 'ms');
  root.style.setProperty('--pt-exit-title-fade-ms', CONFIG.exitTitleFadeMs + 'ms');
  root.style.setProperty('--pt-z', String(CONFIG.zIndex));
  root.style.setProperty('--pt-stroke-color', CONFIG.stroke.color);
  root.style.setProperty('--pt-cursor-size', CONFIG.stroke.cursorSize + 'px');

  // A tiny inline script at the very top of <body> (before the nav/hero
  // markup) may already have created this element — see the head of each
  // HTML file. That script runs before any real page content parses, so
  // the overlay is opaque and covering the viewport from the very first
  // frame instead of appearing after a flash of the real page underneath.
  // Reuse it here rather than creating a second one.
  var overlay = document.getElementById('pt-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pt-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<canvas class="pt-canvas"></canvas>' +
      '<h1 class="pt-title"></h1>' +
      '<div class="pt-cursor"></div>';
    document.body.appendChild(overlay);
  }

  var titleEl = overlay.querySelector('.pt-title');
  var canvas = overlay.querySelector('.pt-canvas');
  var cursorEl = overlay.querySelector('.pt-cursor');
  var ctx = canvas.getContext('2d');

  /* ----------------------------------------------------------------------
   * Canvas glowing-stroke drawing engine
   * -------------------------------------------------------------------- */
  var draw = (function () {
    var dpr = Math.max(window.devicePixelRatio || 1, 1);
    var raw = null;          // latest pointer position {x,y}
    var smoothed = null;     // eased position
    var lastMid = null;      // last drawn midpoint, for quadratic joins
    var rafId = null;
    var listening = false;
    var dirty = false;

    // Crisp (unblurred) accumulator buffers. The glow/body/core layers on
    // the visible canvas are all produced by compositing these with
    // ctx.filter='blur(...)' at different radii/alphas — never by
    // stroking with ctx.shadowBlur per segment. shadowBlur recomputes a
    // fresh blur for each independent short stroke, and its falloff tapers
    // near that stroke's own endpoints; where two segments meet, their
    // tapered edges don't sum back up to full brightness, leaving a
    // visible dashed/seamed look along the line. Blurring one accumulated
    // bitmap has no such seams, and — since it operates on canvas pixels
    // rather than path complexity — its cost per frame stays constant no
    // matter how long the accumulated stroke gets.
    var bodySrc, bodyCtx, coreSrc, coreCtx;

    // Every drawn segment, as the exact args passed to crispSegment
    // ([x0,y0,cx,cy,x1,y1]). This is a real cross-document navigation —
    // the canvas can't survive it — so this log is handed to the next
    // page through sessionStorage and replayed there in one instant pass
    // before the user ever sees a frame, so the stroke reads as one
    // continuous line instead of resetting mid-transition.
    var pathLog = [];

    function makeOffscreen(w, h) {
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }

    function resize() {
      dpr = Math.max(window.devicePixelRatio || 1, 1);
      var w = window.innerWidth;
      var h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Fresh buffers at the new size — any previously accumulated stroke
      // has to be redrawn onto them explicitly (see redrawAll below).
      // Skipping that step used to mean any resize while a transition was
      // up — a real window resize mid-gesture, a device rotation, or (as
      // found while testing this) a viewport that reports 0×0 for a
      // moment before settling to its real size — silently wiped the
      // whole stroke with nothing to put back.
      bodySrc = makeOffscreen(canvas.width, canvas.height);
      bodyCtx = bodySrc.getContext('2d');
      bodyCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      coreSrc = makeOffscreen(canvas.width, canvas.height);
      coreCtx = coreSrc.getContext('2d');
      coreCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      redrawAll();
      composite();
    }

    function redrawAll() {
      var s = CONFIG.stroke;
      for (var i = 0; i < pathLog.length; i++) {
        var seg = pathLog[i];
        crispSegment(bodyCtx, s.color, s.width, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
        crispSegment(coreCtx, s.coreColor, Math.max(1, s.width * s.coreWidthRatio), seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
      }
    }

    function clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bodyCtx) bodyCtx.clearRect(0, 0, bodySrc.width, bodySrc.height);
      if (coreCtx) coreCtx.clearRect(0, 0, coreSrc.width, coreSrc.height);
      raw = smoothed = lastMid = null;
      dirty = false;
      pathLog = [];
    }

    function onMove(e) {
      var events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!events.length) events = [e];
      for (var i = 0; i < events.length; i++) {
        raw = { x: events[i].clientX, y: events[i].clientY };
        if (!smoothed) smoothed = { x: raw.x, y: raw.y };
      }
      cursorEl.style.transform =
        'translate3d(' + raw.x + 'px,' + raw.y + 'px,0)';
      cursorEl.classList.add('is-visible');
    }

    function crispSegment(targetCtx, color, width, x0, y0, cx, cy, x1, y1) {
      targetCtx.lineCap = 'round';
      targetCtx.lineJoin = 'round';
      targetCtx.strokeStyle = color;
      targetCtx.lineWidth = width;
      targetCtx.beginPath();
      targetCtx.moveTo(x0, y0);
      targetCtx.quadraticCurveTo(cx, cy, x1, y1);
      targetCtx.stroke();
    }

    function composite() {
      var s = CONFIG.stroke;
      var w = canvas.width / dpr;
      var h = canvas.height / dpr;
      // A zero-sized canvas (e.g. a layout pass caught mid-flight) makes
      // drawImage throw; since nothing upstream expects that, an uncaught
      // exception here would abort handleArrival() partway through and
      // strand the page with pt-active stuck on <html> (cursor hidden
      // forever, no exit ever scheduled). Skipping this pass is a no-op
      // the next real frame corrects, which is far safer than crashing.
      if (w <= 0 || h <= 0) return;
      ctx.clearRect(0, 0, w, h);

      // 1. soft outer glow — the body stroke, heavily blurred and dimmed
      ctx.save();
      ctx.globalAlpha = s.glowAlpha;
      ctx.filter = 'blur(' + s.glowBlur + 'px)';
      ctx.drawImage(bodySrc, 0, 0, w, h);
      ctx.restore();

      // 2. bright stroke body — the same shape, lightly blurred
      ctx.save();
      ctx.globalAlpha = s.bodyAlpha;
      ctx.filter = s.bodyBlur ? 'blur(' + s.bodyBlur + 'px)' : 'none';
      ctx.drawImage(bodySrc, 0, 0, w, h);
      ctx.restore();

      // 3. thin white-hot core
      ctx.save();
      ctx.globalAlpha = s.coreAlpha;
      ctx.filter = s.coreBlur ? 'blur(' + s.coreBlur + 'px)' : 'none';
      ctx.drawImage(coreSrc, 0, 0, w, h);
      ctx.restore();
    }

    function tick() {
      rafId = requestAnimationFrame(tick);
      if (!raw) return;
      if (!smoothed) smoothed = { x: raw.x, y: raw.y };

      var s = CONFIG.stroke;
      var prev = { x: smoothed.x, y: smoothed.y };
      smoothed.x += (raw.x - smoothed.x) * s.smoothing;
      smoothed.y += (raw.y - smoothed.y) * s.smoothing;

      var mid = { x: (prev.x + smoothed.x) / 2, y: (prev.y + smoothed.y) / 2 };
      if (lastMid) {
        var seg = [lastMid.x, lastMid.y, prev.x, prev.y, mid.x, mid.y];
        crispSegment(bodyCtx, s.color, s.width, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
        crispSegment(coreCtx, s.coreColor, Math.max(1, s.width * s.coreWidthRatio), seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
        pathLog.push(seg);
        dirty = true;
      }
      lastMid = mid;

      if (dirty) {
        composite();
        dirty = false;
      }
    }

    // restorePath: an optional path log (from getPath(), handed through
    // sessionStorage as plain arrays) drawn instantly — no animation — so
    // the very first frame already shows the line exactly where it left
    // off on the previous page, instead of a blank canvas that a moving
    // pointer only gradually re-fills.
    function start(restorePath) {
      // No drawing at all on touch/mobile — precise freehand marks are
      // hard to make with a thumb, and an accidental touch-drag while
      // tapping a nav link shouldn't scribble across the transition. The
      // overlay itself (title, rise, exit) is untouched; this only skips
      // the canvas setup, so there's nothing left running to draw with.
      if (isMobile) return;

      clear();

      // Seed pathLog *before* resize() — resize() (re)draws whatever is
      // in pathLog onto the freshly-(re)created buffers, so this makes
      // the very first sizing pass also be the one that paints the
      // restored stroke, with no separate draw step that a later resize
      // could then wipe out (see the comment in resize()).
      if (restorePath && restorePath.length) {
        pathLog = restorePath.slice();
        var last = restorePath[restorePath.length - 1];
        lastMid = { x: last[4], y: last[5] };
        smoothed = { x: last[4], y: last[5] };
      }

      resize();

      if (!listening) {
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('resize', resize);
        listening = true;
      }
      if (!rafId) rafId = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (listening) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('resize', resize);
        listening = false;
      }
      clear();
      cursorEl.classList.remove('is-visible');
    }

    function getPath() {
      return pathLog;
    }

    return { start: start, stop: stop, getPath: getPath };
  })();

  /* ----------------------------------------------------------------------
   * Title / route helpers
   * -------------------------------------------------------------------- */
  function titleFor(href, fallbackText) {
    try {
      var url = new URL(href, window.location.href);
      var file = url.pathname.split('/').pop();
      if (CONFIG.titles.hasOwnProperty(file)) return CONFIG.titles[file];
    } catch (e) { /* ignore malformed href */ }
    return (fallbackText || '').trim();
  }

  function isSamePage(href) {
    try {
      var url = new URL(href, window.location.href);
      return url.pathname === window.location.pathname && url.origin === window.location.origin;
    } catch (e) { return false; }
  }

  /* ----------------------------------------------------------------------
   * Enter / hold / navigate (leaving page)
   * -------------------------------------------------------------------- */
  var active = false;

  function beginTransition(href, title) {
    if (active) return;
    active = true;
    root.classList.add('pt-active');

    titleEl.textContent = title;
    overlay.classList.remove('is-exiting', 'is-arrived');
    titleEl.classList.remove('is-visible');

    if (reduceMotion) {
      overlay.classList.add('is-entering');
      titleEl.classList.add('is-visible');
      draw.start();
      setTimeout(function () { navigate(href, title); }, 220);
      return;
    }

    // Force layout before adding the class so the rise transition runs.
    // eslint-disable-next-line no-unused-expressions
    overlay.getBoundingClientRect();
    requestAnimationFrame(function () {
      overlay.classList.add('is-entering');
    });

    draw.start();

    setTimeout(function () {
      titleEl.classList.add('is-visible');
    }, CONFIG.enterMs + CONFIG.titleFadeDelayMs);

    setTimeout(function () {
      navigate(href, title);
    }, CONFIG.enterMs + CONFIG.holdMs);
  }

  function navigate(href, title) {
    try {
      sessionStorage.setItem(CONFIG.storageKey, JSON.stringify({
        title: title,
        ts: Date.now(),
        path: draw.getPath()
      }));
    } catch (e) { /* storage unavailable — navigation still proceeds */ }
    window.location.href = href;
  }

  // The page's own [data-reveal] fade/slide-up (nav.css) is meant for a
  // direct/bookmarked load. When we arrive via our own transition, the
  // overlay lifting away *is* the reveal — letting [data-reveal] also
  // play underneath (or, worse, re-trigger later when the pt-active class
  // that briefly masked it gets removed, since changing `animation` away
  // from 'none' restarts it) shows up as a stray jump/pop right around
  // when the black screen clears. Disabling it with inline styles (not a
  // class that gets removed) makes the skip permanent for this page view.
  function skipRevealAnimations() {
    var els = document.querySelectorAll('[data-reveal]');
    for (var i = 0; i < els.length; i++) {
      els[i].style.animation = 'none';
      els[i].style.opacity = '1';
      els[i].style.transform = 'none';
    }
  }

  // Waits for the page to actually finish loading (images, fonts, the
  // deferred scripts that build things like the index-page ASCII garden)
  // before the hold timer starts counting down — otherwise the overlay
  // can lift while that content is still assembling, and its pop-in reads
  // as the same kind of jump. Capped so a slow/failed resource can't hang
  // the transition indefinitely.
  function whenReady(cb) {
    if (document.readyState === 'complete') { cb(); return; }
    var done = false;
    function fire() { if (done) return; done = true; cb(); }
    window.addEventListener('load', fire, { once: true });
    setTimeout(fire, 1500);
  }

  /* ----------------------------------------------------------------------
   * Arrival (new page) — pick up the handoff and exit smoothly
   * -------------------------------------------------------------------- */
  function handleArrival() {
    var raw;
    try { raw = sessionStorage.getItem(CONFIG.storageKey); } catch (e) { return; }
    if (!raw) return;
    try { sessionStorage.removeItem(CONFIG.storageKey); } catch (e) { /* noop */ }

    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || (Date.now() - data.ts) > CONFIG.maxHandoffAgeMs) return;

    active = true;
    root.classList.add('pt-active');

    // Everything from here on is cosmetic (reveal-skip, redrawing the
    // carried-over stroke, the transform dance to avoid replaying the
    // rise animation). None of it should be able to strand the page: if
    // any of it throws for a reason we didn't anticipate, pt-active would
    // otherwise stay stuck on <html> forever (cursor hidden, no exit ever
    // scheduled) since nothing downstream would run. Guarantee the exit
    // gets scheduled regardless.
    try {
      skipRevealAnimations();
      titleEl.textContent = data.title || '';
      titleEl.classList.add('is-visible');
      draw.start(data.path);

      // Snap straight to the "fully covering" state with no rise
      // animation: disable the transition, apply the state, force a
      // synchronous reflow so the browser commits it without animating,
      // then restore the transition so the exit (added later) animates
      // normally. This is synchronous on purpose — an rAF-based cleanup
      // would get stuck if the tab is backgrounded right after
      // navigation, since rAF pauses in hidden tabs but the exit's
      // setTimeout below does not.
      overlay.style.transition = 'none';
      overlay.classList.add('is-entering', 'is-arrived');
      // eslint-disable-next-line no-unused-expressions
      overlay.offsetHeight;
      overlay.style.transition = '';
    } catch (e) { /* fall through — the exit below still has to run */ }

    whenReady(function () {
      setTimeout(runExit, reduceMotion ? 60 : CONFIG.arrivalHoldMs);
    });
  }

  function runExit() {
    titleEl.classList.remove('is-visible');
    overlay.classList.add('is-exiting');

    var exitMs = reduceMotion ? 150 : CONFIG.exitMs;
    setTimeout(function () {
      // Dropping is-exiting here would otherwise let the overlay's base
      // rule (transform: translateY(100%)) transition back in using the
      // *enter* duration/easing, sliding back down through the fully
      // visible center of the screen on top of the page we just revealed.
      // Disable the transition for this one synchronous state change.
      overlay.style.transition = 'none';
      root.classList.remove('pt-active');
      overlay.classList.remove('is-entering', 'is-exiting', 'is-arrived');
      // eslint-disable-next-line no-unused-expressions
      overlay.offsetHeight;
      overlay.style.transition = '';
      draw.stop();
      active = false;
    }, exitMs);
  }

  /* ----------------------------------------------------------------------
   * Click interception
   * -------------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var link = e.target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (link.target && link.target !== '' && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;

    var url;
    try { url = new URL(href, window.location.href); } catch (err) { return; }
    if (url.origin !== window.location.origin) return;
    if (isSamePage(href)) return;

    e.preventDefault();
    beginTransition(url.href, titleFor(url.href, link.textContent));
  });

  handleArrival();
})();
