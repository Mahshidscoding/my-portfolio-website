/**
 * smooth-scroll.js — eased page scrolling for the Projects page (desktop,
 * mouse/trackpad). Scrolls the window through Lenis, so sticky elements and
 * the scroll-linked image reveal stay in sync with it.
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
})();
