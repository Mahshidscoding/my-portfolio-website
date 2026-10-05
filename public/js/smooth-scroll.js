/**
 * smooth-scroll.js — eased page scrolling for the Projects page (desktop,
 * mouse/trackpad). Scrolls the window through Lenis, so sticky elements and
 * the scroll-linked image reveal stay in sync with it.
 *
 * Lenis measures the page height once and only re-measures when the window
 * resizes. This page grows after load (images and videos arrive, panels
 * switch), so the scroll limit has to be refreshed whenever the height
 * changes — otherwise long projects stop scrolling partway down.
 */
(function () {
  'use strict';

  if (typeof Lenis === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(min-width: 1025px) and (pointer: fine)').matches) return;

  var lenis = new Lenis({
    duration: 1.35,
    wheelMultiplier: 0.85,
    smoothWheel: true
  });

  lenis.on('scroll', function () {
    if (window.imageReveal) window.imageReveal.refresh();
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  var lastHeight = 0;
  function syncHeight() {
    var h = document.documentElement.scrollHeight;
    if (h === lastHeight) return;
    lastHeight = h;
    lenis.resize();
  }

  // Images/videos finishing loading, the window finishing loading, and
  // switching between the globe and a project all change the page height.
  document.addEventListener('load', syncHeight, true);
  document.addEventListener('loadedmetadata', syncHeight, true);
  window.addEventListener('load', syncHeight);
  window.addEventListener('hashchange', syncHeight);
  document.addEventListener('click', function () { setTimeout(syncHeight, 50); setTimeout(syncHeight, 600); });
  setInterval(syncHeight, 400);
  syncHeight();
})();
