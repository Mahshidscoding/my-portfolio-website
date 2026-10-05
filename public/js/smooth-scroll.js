/**
 * smooth-scroll.js — eased page scrolling for the Projects page (desktop,
 * mouse/trackpad). Scrolls the window through Lenis, so sticky elements and
 * the scroll-linked image reveal stay in sync with it.
 *
 * Safety first: if smooth scrolling ever stops the page from moving, it
 * switches itself off and the browser's normal scrolling takes over.
 */
(function () {
  'use strict';

  if (typeof Lenis === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(min-width: 1025px) and (pointer: fine)').matches) return;

  var lenis;
  try {
    lenis = new Lenis({
      duration: 1.35,
      wheelMultiplier: 0.85,
      smoothWheel: true
    });
  } catch (e) {
    return;
  }

  var dead = false;

  function shutDown() {
    if (dead) return;
    dead = true;
    try { lenis.destroy(); } catch (e) {}
    document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-scrolling');
  }

  lenis.on('scroll', function () {
    try { if (window.imageReveal) window.imageReveal.refresh(); } catch (e) {}
  });

  // Schedule the next frame first, so an error in one frame can never stop
  // the loop (a stopped loop would leave the page unable to scroll at all).
  function raf(time) {
    if (dead) return;
    requestAnimationFrame(raf);
    try { lenis.raf(time); } catch (e) { shutDown(); }
  }
  requestAnimationFrame(raf);

  // Lenis only measures the page height on window resize, but this page
  // grows after load (images, videos, switching projects). Re-measure
  // without touching the scroll position, so a scroll in progress is never
  // interrupted.
  var lastHeight = 0;
  function syncHeight() {
    if (dead) return;
    var h = document.documentElement.scrollHeight;
    if (h === lastHeight) return;
    lastHeight = h;
    try { lenis.dimensions.resize(); } catch (e) {}
  }

  document.addEventListener('load', syncHeight, true);
  document.addEventListener('loadedmetadata', syncHeight, true);
  window.addEventListener('load', syncHeight);
  window.addEventListener('hashchange', syncHeight);
  document.addEventListener('click', function () { setTimeout(syncHeight, 50); setTimeout(syncHeight, 600); });
  setInterval(syncHeight, 400);
  syncHeight();

  // Watchdog: a wheel/trackpad scroll on a page that can scroll must move it.
  // If several in a row don't, give scrolling back to the browser.
  var strikes = 0;
  window.addEventListener('wheel', function (e) {
    if (dead || e.ctrlKey) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var y0 = window.scrollY;
    var dy = e.deltaY;
    if (max <= 1 || !dy) return;
    if ((dy > 0 && y0 >= max - 1) || (dy < 0 && y0 <= 1)) return;
    setTimeout(function () {
      if (dead) return;
      if (Math.abs(window.scrollY - y0) < 1) strikes++;
      else strikes = 0;
      if (strikes >= 4) shutDown();
    }, 800);
  }, { passive: true });
})();
