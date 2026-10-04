/**
 * page-transition.js — cinematic black-overlay page transition + chrome
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

    // If we've asked the browser to navigate and this page is still alive
    // after this long, assume the navigation never happened and lift the
    // overlay (see navigate()). Generous so a slow network doesn't trip it.
    navigationTimeoutMs: 6000,

    // Chrome brush. The stroke is accumulated as a plain shape and then
    // run through the #chrome SVG filter (see CHROME_FILTER below), which
    // only reads its alpha — the lighting, grain and shadow all come from
    // the filter, so `color` is just the fallback a browser without
    // canvas-filter support (Safari) draws instead.
    stroke: {
      color: '#c9d3dc',
      width: 22,              // stroke thickness (px, CSS pixels) — needs
                              // to be wide enough for the filter's bump
                              // blur (stdDeviation 5.5) to read as a tube
      smoothing: 0.3,         // 0..1, lower = more lag/smoothing
      cursorSize: 18
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
  root.style.setProperty('--pt-cursor-size', CONFIG.stroke.cursorSize + 'px');

  // The chrome brush filter (your design, minus the final feDropShadow —
  // it cost a whole extra blur pass per frame for a barely visible
  // shadow). The grain (feTurbulence + feDisplacementMap) is the other
  // expensive part; it's also what makes this read as brushed metal, so
  // it stays. It has to live in the document for
  // ctx.filter = 'url(#chrome)' to find it. Not display:none — filters
  // inside a non-rendered <svg> don't resolve in some browsers. Skipped
  // on mobile, where nothing is ever drawn.
  var CHROME_FILTER =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
      '<filter id="chrome" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">' +
        '<feGaussianBlur in="SourceAlpha" stdDeviation="5.5" result="bump"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.02 0.9" numOctaves="2" seed="4" result="grain"/>' +
        '<feDisplacementMap in="bump" in2="grain" scale="5" result="rough"/>' +
        '<feDiffuseLighting in="rough" surfaceScale="14" diffuseConstant="1.1" lighting-color="#c9d3dc" result="body">' +
          '<feDistantLight azimuth="225" elevation="35"/>' +
        '</feDiffuseLighting>' +
        '<feSpecularLighting in="rough" surfaceScale="18" specularConstant="1.4" specularExponent="28" lighting-color="#ffffff" result="shine">' +
          '<feDistantLight azimuth="225" elevation="50"/>' +
        '</feSpecularLighting>' +
        '<feComposite in="shine" in2="body" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>' +
        '<feComposite in="lit" in2="SourceAlpha" operator="in" result="metal"/>' +
      '</filter>' +
    '</svg>';
  if (!isMobile && !document.getElementById('chrome')) {
    var filterHost = document.createElement('div');
    filterHost.innerHTML = CHROME_FILTER;
    document.body.appendChild(filterHost.firstChild);
  }

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
   * Canvas chrome-stroke drawing engine
   * -------------------------------------------------------------------- */
  var draw = (function () {
    var dpr = Math.max(window.devicePixelRatio || 1, 1);
    var raw = null;          // latest pointer position {x,y}
    var smoothed = null;     // eased position
    var lastMid = null;      // last drawn midpoint, for quadratic joins
    var rafId = null;
    var listening = false;
    var dirty = false;

    // Crisp accumulator buffer: every segment is stroked here as a plain
    // shape, and the visible canvas is produced by running that one
    // accumulated bitmap through the chrome filter. Filtering the whole
    // bitmap (rather than each short segment) is what keeps the lighting
    // seamless where segments meet.
    var bodySrc, bodyCtx;

    // The chrome filter (blur + turbulence + displacement + two lighting
    // passes) is the expensive part, and its cost has a fixed overhead plus
    // a per-pixel part. Re-filtering everything drawn so far every frame
    // (as this used to) dropped the stroke to ~25fps and got worse the
    // more you drew, which made fast scribbles lag behind the cursor. So
    // each frame only the small patch around the newly added segment is
    // re-filtered; the rest of the visible canvas is left as it was.
    //
    // PATCH_PAD is how far a new segment's look can reach (half the stroke
    // width + the filter's blur / displacement / drop-shadow reach), so
    // everything that could have changed is inside the patch.
    // CONTEXT_MARGIN is extra surrounding source fed to the filter but not
    // written back, so lighting at the patch edge sees its real neighbours.
    // Checked against a single full-stroke render: with these values the
    // patched result is pixel-identical (grain included), and ~4x cheaper.
    function patchPad() { return CONFIG.stroke.width + 24; }
    var CONTEXT_MARGIN = 30;

    // Bounding box of everything drawn so far (CSS px) — used only for a
    // full redraw (resize / restoring a carried-over stroke).
    var bounds = null;
    // Region touched since the last composite().
    var dirtyRect = null;

    function segRect(seg, pad) {
      return {
        x0: Math.min(seg[0], seg[2], seg[4]) - pad,
        y0: Math.min(seg[1], seg[3], seg[5]) - pad,
        x1: Math.max(seg[0], seg[2], seg[4]) + pad,
        y1: Math.max(seg[1], seg[3], seg[5]) + pad
      };
    }

    function union(a, b) {
      if (!a) return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
      a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0);
      a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
      return a;
    }

    function growBounds(seg) {
      bounds = union(bounds, segRect(seg, patchPad()));
    }

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

      redrawAll();
      composite(true);
    }

    function redrawAll() {
      var s = CONFIG.stroke;
      bounds = null;
      for (var i = 0; i < pathLog.length; i++) {
        var seg = pathLog[i];
        crispSegment(bodyCtx, s.color, s.width, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
        growBounds(seg);
      }
    }

    function clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bodyCtx) bodyCtx.clearRect(0, 0, bodySrc.width, bodySrc.height);
      raw = smoothed = lastMid = null;
      dirty = false;
      pathLog = [];
      bounds = null;
      dirtyRect = null;
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

    function composite(full) {
      var w = canvas.width / dpr;
      var h = canvas.height / dpr;
      // A zero-sized canvas (e.g. a layout pass caught mid-flight) makes
      // drawImage throw; since nothing upstream expects that, an uncaught
      // exception here would abort handleArrival() partway through and
      // strand the page with pt-active stuck on <html> (cursor hidden
      // forever, no exit ever scheduled). Skipping this pass is a no-op
      // the next real frame corrects, which is far safer than crashing.
      if (w <= 0 || h <= 0) return;

      if (full) {
        ctx.clearRect(0, 0, w, h);
        dirtyRect = null;
        if (bounds) patch(bounds, 0, w, h);
        return;
      }
      if (!dirtyRect) return;
      var r = dirtyRect;
      dirtyRect = null;
      patch(r, CONTEXT_MARGIN, w, h);
    }

    // Re-filters one rectangle (CSS px) of the accumulator onto the
    // visible canvas, replacing whatever was there. `margin` extra source
    // around it is filtered too but clipped away — see CONTEXT_MARGIN.
    function patch(r, margin, w, h) {
      function cl(v, max) { return Math.max(0, Math.min(max, v)); }
      var rx0 = cl(Math.floor(r.x0), w), ry0 = cl(Math.floor(r.y0), h);
      var rx1 = cl(Math.ceil(r.x1), w),  ry1 = cl(Math.ceil(r.y1), h);
      if (rx1 <= rx0 || ry1 <= ry0) return;
      var sx0 = cl(rx0 - margin, w), sy0 = cl(ry0 - margin, h);
      var sx1 = cl(rx1 + margin, w), sy1 = cl(ry1 + margin, h);

      // Source rect is in device pixels (bodySrc's own size); the
      // destination is in CSS pixels (ctx carries the dpr transform).
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      ctx.clip();
      ctx.clearRect(rx0, ry0, rx1 - rx0, ry1 - ry0);
      ctx.filter = 'url(#chrome)';
      ctx.drawImage(bodySrc,
        sx0 * dpr, sy0 * dpr, (sx1 - sx0) * dpr, (sy1 - sy0) * dpr,
        sx0, sy0, sx1 - sx0, sy1 - sy0);
      ctx.restore();
    }

    var lastTickAt = 0;

    function tick() {
      rafId = requestAnimationFrame(tick);
      var now = performance.now();
      var dt = lastTickAt ? now - lastTickAt : 16.7;
      lastTickAt = now;
      if (!raw) return;
      if (!smoothed) smoothed = { x: raw.x, y: raw.y };

      // Time-based smoothing: `smoothing` is the fraction of the remaining
      // gap closed per 60fps frame, rescaled by the real elapsed time. A
      // fixed per-frame fraction means that whenever frames run long the
      // line closes the same *fraction* of the gap in far more wall-clock
      // time, so it trails further behind a fast-moving cursor. dt is
      // capped so a stall (tab switch, GC) doesn't teleport the line.
      var s = CONFIG.stroke;
      var k = 1 - Math.pow(1 - s.smoothing, Math.min(dt, 100) / 16.667);
      var prev = { x: smoothed.x, y: smoothed.y };
      smoothed.x += (raw.x - smoothed.x) * k;
      smoothed.y += (raw.y - smoothed.y) * k;

      var mid = { x: (prev.x + smoothed.x) / 2, y: (prev.y + smoothed.y) / 2 };
      if (lastMid) {
        var seg = [lastMid.x, lastMid.y, prev.x, prev.y, mid.x, mid.y];
        crispSegment(bodyCtx, s.color, s.width, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
        growBounds(seg);
        dirtyRect = union(dirtyRect, segRect(seg, patchPad()));
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
      lastTickAt = 0;

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

    // If the page is still here a few seconds later, the navigation never
    // actually left it (a hash-only change to the same document, a
    // download, a failed/blocked request) and nothing else would ever
    // lift the overlay. A real navigation unloads this page and takes the
    // timer with it, so this only ever fires in the stuck case.
    setTimeout(function () {
      if (active) {
        try { sessionStorage.removeItem(CONFIG.storageKey); } catch (e) { /* noop */ }
        resetOverlay();
      }
    }, CONFIG.navigationTimeoutMs);
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
    setTimeout(resetOverlay, exitMs);
  }

  // Puts the overlay back to its idle, off-screen state. Used when the
  // exit finishes and by the recovery paths below (back/forward restore,
  // navigation that never left the page).
  function resetOverlay() {
    // Dropping is-exiting here would otherwise let the overlay's base
    // rule (transform: translateY(100%)) transition back in using the
    // *enter* duration/easing, sliding back down through the fully
    // visible center of the screen on top of the page we just revealed.
    // Disable the transition for this one synchronous state change.
    overlay.style.transition = 'none';
    root.classList.remove('pt-active');
    overlay.classList.remove('is-entering', 'is-exiting', 'is-arrived');
    titleEl.classList.remove('is-visible');
    // eslint-disable-next-line no-unused-expressions
    overlay.offsetHeight;
    overlay.style.transition = '';
    draw.stop();
    active = false;
  }

  // Back/forward restore. Leaving a page freezes it with the overlay fully
  // risen; browsers that keep pages in the back/forward cache restore that
  // frozen page as-is when you press Back — no script re-runs, so the
  // black screen would sit there forever. pageshow still fires with
  // persisted=true, which is the one chance to lift it.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      try { sessionStorage.removeItem(CONFIG.storageKey); } catch (err) { /* noop */ }
      resetOverlay();
    }
  });

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
