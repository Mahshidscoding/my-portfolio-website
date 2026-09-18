/**
 * playground.js — Playground SPA
 *  - cards view: floating, draggable project cards (interact.js) with a
 *    gentle idle drift (GSAP) — the same interaction the very first
 *    Projects SPA build used, kept here to feel deliberately looser/more
 *    playful than the Projects page's static tile grid
 *  - reading view: left rail (flat project navigation) + scrolling panel,
 *    each panel just a title, a short description, and one image
 *  - switch projects without a page reload
 *  - #slug hash routing + "All playground" button back to the cards view
 */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isCompact = function () { return window.matchMedia('(max-width: 1024px)').matches; };

  var app = document.querySelector('.playground-app');
  var stage = document.querySelector('.cards-stage');
  var railList = document.querySelector('.rail-list');
  var panelsWrap = document.querySelector('.reading-panels');
  var toCardsBtn = document.querySelector('.to-cards');
  if (!app || !stage || !panelsWrap) return;

  var floats = Array.prototype.slice.call(document.querySelectorAll('.project-float'));
  var panels = {};
  Array.prototype.forEach.call(panelsWrap.querySelectorAll('.project-panel'), function (p) {
    panels[p.dataset.slug] = p;
  });

  var SLUGS = floats.map(function (f) { return f.dataset.slug; });
  var current = null;
  var drifts = {};
  var dragMoved = {}; // slug -> cumulative px moved this pointer-down, to tell a drag from a tap
  var DRAG_THRESHOLD = 6;

  /* ====================================================================
   * Build the rail
   * ================================================================== */
  var RAIL_DOTS = ['#e389ac', '#6b8afd', '#a77bd6', '#6fae82', '#e8a95a', '#7cc3d6'];

  function nameFor(slug) {
    var float = floats.find(function (f) { return f.dataset.slug === slug; });
    return float ? float.querySelector('.project-float__name').textContent : slug;
  }

  function buildRail() {
    railList.innerHTML = '';
    SLUGS.forEach(function (slug, i) {
      var item = document.createElement('div');
      item.className = 'rail-item';
      item.dataset.slug = slug;
      item.style.setProperty('--dot', RAIL_DOTS[i % RAIL_DOTS.length]);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rail-item__name';
      btn.textContent = nameFor(slug);
      btn.addEventListener('click', function () {
        if (slug !== current) openProject(slug);
      });
      item.appendChild(btn);

      railList.appendChild(item);
    });
  }

  /* ====================================================================
   * "Next project" button — bottom of every panel, wraps around SLUGS
   * ================================================================== */
  function buildNextButtons() {
    SLUGS.forEach(function (slug, i) {
      var btn = panels[slug] && panels[slug].querySelector('[data-next-project]');
      if (!btn) return;
      var nextSlug = SLUGS[(i + 1) % SLUGS.length];
      btn.querySelector('.next-project__name').textContent = nameFor(nextSlug);
      btn.addEventListener('click', function () {
        openProject(nextSlug);
      });
    });
  }

  function markActiveRail(slug) {
    Array.prototype.forEach.call(railList.children, function (item) {
      item.classList.toggle('is-active', item.dataset.slug === slug);
    });
  }

  /* ====================================================================
   * Open / close projects
   * ================================================================== */
  function showPanel(slug) {
    Object.keys(panels).forEach(function (s) {
      panels[s].hidden = (s !== slug);
    });
    // restart entry animation
    var p = panels[slug];
    p.style.animation = 'none';
    void p.offsetWidth;
    p.style.animation = '';
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function openProject(slug) {
    if (!panels[slug]) return;
    if (slug === current && app.dataset.view === 'reading') return;

    stopAllDrift();
    current = slug;
    app.dataset.view = 'reading';
    if (!railList.children.length) buildRail();
    markActiveRail(slug);
    showPanel(slug);
    if (history.replaceState) history.replaceState(null, '', '#' + slug);
    else location.hash = slug;
  }

  function backToCards() {
    current = null;
    app.dataset.view = 'cards';
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    else location.hash = '';
    Object.keys(panels).forEach(function (s) { panels[s].hidden = true; });
    window.scrollTo({ top: 0, behavior: 'auto' });
    startAllDrift();
  }

  if (toCardsBtn) toCardsBtn.addEventListener('click', backToCards);

  /* ====================================================================
   * Floating cards — drag + idle drift
   * ================================================================== */
  function setTransform(el, x, y) {
    el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    el.dataset.x = x;
    el.dataset.y = y;
  }

  function initDrag() {
    if (typeof interact === 'undefined' || isCompact()) return;
    floats.forEach(function (el) {
      setTransform(el, 0, 0);
      interact(el).draggable({
        inertia: true,
        listeners: {
          start: function (e) {
            stopDrift(e.target.dataset.slug);
            dragMoved[e.target.dataset.slug] = 0;
            e.target.classList.add('is-dragging');
            e.target.style.zIndex = 500;
          },
          move: function (e) {
            var slug = e.target.dataset.slug;
            dragMoved[slug] = (dragMoved[slug] || 0) + Math.abs(e.dx) + Math.abs(e.dy);
            var x = (parseFloat(e.target.dataset.x) || 0) + e.dx;
            var y = (parseFloat(e.target.dataset.y) || 0) + e.dy;
            setTransform(e.target, x, y);
          },
          end: function (e) { e.target.classList.remove('is-dragging'); }
        }
      });
    });
  }

  function startDrift(slug) {
    if (reduce || isCompact() || typeof gsap === 'undefined') return;
    var el = floats.find(function (f) { return f.dataset.slug === slug; });
    if (!el || drifts[slug]) return;
    var baseX = parseFloat(el.dataset.x) || 0;
    var baseY = parseFloat(el.dataset.y) || 0;
    var ax = 10 + Math.random() * 12;
    var ay = 10 + Math.random() * 12;
    drifts[slug] = gsap.to(el, {
      duration: 4 + Math.random() * 2,
      x: baseX + (Math.random() > 0.5 ? ax : -ax),
      y: baseY + (Math.random() > 0.5 ? ay : -ay),
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      onUpdate: function () {
        el.dataset.x = gsap.getProperty(el, 'x');
        el.dataset.y = gsap.getProperty(el, 'y');
      }
    });
  }

  function stopDrift(slug) {
    if (drifts[slug]) { drifts[slug].kill(); delete drifts[slug]; }
  }

  function startAllDrift() { SLUGS.forEach(function (s) { setTimeout(function () { startDrift(s); }, Math.random() * 600); }); }
  function stopAllDrift() { SLUGS.forEach(stopDrift); }

  floats.forEach(function (el) {
    el.addEventListener('click', function () {
      var slug = el.dataset.slug;
      var moved = dragMoved[slug] || 0;
      dragMoved[slug] = 0;
      if (moved > DRAG_THRESHOLD) return; // was a drag, not a tap — don't open
      openProject(slug);
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openProject(el.dataset.slug);
      }
    });
  });

  /* ====================================================================
   * Hash routing
   * ================================================================== */
  window.addEventListener('hashchange', function () {
    var slug = location.hash.replace('#', '');
    if (panels[slug] && slug !== current) openProject(slug);
    else if (!panels[slug] && current) backToCards();
  });

  /* ====================================================================
   * Boot
   * ================================================================== */
  buildRail();
  buildNextButtons();
  initDrag();
  if (location.hash && panels[location.hash.replace('#', '')]) {
    openProject(location.hash.replace('#', ''));
  } else {
    startAllDrift();
  }
})();
