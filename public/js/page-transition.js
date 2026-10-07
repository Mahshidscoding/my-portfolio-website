/**
 * page-transition.js — black-overlay page transition, kept quick.
 *
 * Runs on every page that shares the top nav (index.html, projects.html,
 * playground.html, AI.html). Since this is a real multi-page site (no
 * client-side router), the "hold" state is handed off across the actual
 * navigation via sessionStorage: the leaving page rises + holds + shows
 * the title, then navigates; the arriving page detects the handoff flag as
 * its very first action and continues straight into the exit, so the
 * black screen never has a seam.
 *
 * (There used to be a freehand chrome-brush drawing layer on the black
 * screen; it was removed for a faster, plainer wipe. It's in git history,
 * commit 90f498a, if it's ever wanted back.)
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

    // Timing (ms) — quick but not abrupt: ~240 rise, a beat, ~280 exit
    // (about 0.7s of black in total). Same shape on every device. Keep
    // titleFadeDelayMs + titleFadeMs <= holdMs so the title is fully in
    // before the page hands off (the new page shows it already settled).
    // Tune freely.
    enterMs: 240,
    holdMs: 130,
    titleFadeDelayMs: 10,   // after the rise completes
    titleFadeMs: 110,
    arrivalHoldMs: 50,      // brief hold on the new page before exiting
    exitMs: 280,
    exitTitleFadeMs: 90,

    // Easing. Enter decelerates hard (expo-out feel); exit is a smooth
    // ease-in-out continuation of the same upward motion.
    enterEase: 'cubic-bezier(0.16, 1, 0.3, 1)',
    exitEase: 'cubic-bezier(0.65, 0, 0.35, 1)',

    // A sessionStorage handoff older than this is treated as stale
    // (e.g. a bfcache restore or a much later back/forward) and ignored.
    maxHandoffAgeMs: 4000,

    // How long the arriving page waits for its own load event before
    // lifting the overlay anyway. Waiting avoids content popping in right
    // as the screen clears, but on a blink a long wait is just a long
    // black screen, so keep this short.
    arrivalLoadWaitMs: 500,

    // If we've asked the browser to navigate and this page is still alive
    // after this long, assume the navigation never happened and lift the
    // overlay (see navigate()). Generous so a slow network doesn't trip it.
    navigationTimeoutMs: 6000,

    zIndex: 100000,

    storageKey: 'pt:handoff'
  };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    overlay.innerHTML = '<h1 class="pt-title"></h1>';
    document.body.appendChild(overlay);
  }

  var titleEl = overlay.querySelector('.pt-title');

  // Centre the title on the screen, not the overlay: the overlay is narrower
  // by any reserved scrollbar space, which only some pages have (see
  // .pt-title in css/page-transition.css). Same calculation as the inline
  // early-paint script at the top of each page's <body>.
  function centreTitle() {
    overlay.style.setProperty('--pt-shift', (window.innerWidth - overlay.getBoundingClientRect().width) / 2 + 'px');
  }
  centreTitle();
  window.addEventListener('resize', centreTitle);
  // the overlay's width also changes when a page's reserved scrollbar space
  // appears; ResizeObserver catches that before the next paint
  if (window.ResizeObserver) new ResizeObserver(centreTitle).observe(overlay);

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
      setTimeout(function () { navigate(href, title); }, 220);
      return;
    }

    // Force layout before adding the class so the rise transition runs.
    // eslint-disable-next-line no-unused-expressions
    overlay.getBoundingClientRect();
    requestAnimationFrame(function () {
      overlay.classList.add('is-entering');
    });

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
        ts: Date.now()
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
    setTimeout(fire, CONFIG.arrivalLoadWaitMs);
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

    // Everything from here on is cosmetic (reveal-skip, the transform
    // dance to avoid replaying the rise animation). None of it should be able to strand the page: if
    // any of it throws for a reason we didn't anticipate, pt-active would
    // otherwise stay stuck on <html> forever (no exit ever
    // scheduled) since nothing downstream would run. Guarantee the exit
    // gets scheduled regardless.
    try {
      skipRevealAnimations();
      titleEl.textContent = data.title || '';
      titleEl.classList.add('is-visible');

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
