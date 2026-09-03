/**
 * projects.js — Projects SPA
 *  - floating draggable cards (interact.js) with a gentle idle drift
 *  - click a card -> it flies into the left rail (FLIP) and the reading view opens
 *  - left rail: project list + per-project section jump-list
 *  - switch projects / jump to sections without a page reload
 *  - #slug hash routing + "All projects" button back to the cards view
 */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isCompact = function () { return window.matchMedia('(max-width: 1024px)').matches; };

  var app = document.querySelector('.projects-app');
  var stage = document.querySelector('.cards-stage');
  var railList = document.querySelector('.rail-list');
  var panelsWrap = document.querySelector('.reading-panels');
  var scroller = document.querySelector('.reading-scroll');
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

  /* ====================================================================
   * Section index — for each panel, list its jump targets
   * ================================================================== */
  function sectionsFor(panel) {
    var out = [{ label: 'Overview', el: panel }];
    Array.prototype.forEach.call(panel.querySelectorAll('.text-section h2'), function (h) {
      out.push({ label: h.textContent.trim(), el: h.closest('.text-section') });
    });
    return out;
  }

  /* ====================================================================
   * Build the rail
   * ================================================================== */
  function buildRail() {
    railList.innerHTML = '';
    SLUGS.forEach(function (slug) {
      var float = floats.find(function (f) { return f.dataset.slug === slug; });
      var name = float.querySelector('.project-float__name').textContent;

      var item = document.createElement('div');
      item.className = 'rail-item';
      item.dataset.slug = slug;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rail-item__name';
      btn.textContent = name;
      btn.addEventListener('click', function () {
        if (slug !== current) openProject(slug, { animate: false });
      });
      item.appendChild(btn);

      var secWrap = document.createElement('div');
      secWrap.className = 'rail-item__sections';
      item.appendChild(secWrap);

      railList.appendChild(item);
    });
  }

  function fillSections(slug) {
    var item = railList.querySelector('.rail-item[data-slug="' + slug + '"]');
    if (!item) return;
    var wrap = item.querySelector('.rail-item__sections');
    wrap.innerHTML = '';
    sectionsFor(panels[slug]).forEach(function (sec) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rail-section';
      b.textContent = sec.label;
      b.addEventListener('click', function () {
        var behavior = reduce ? 'auto' : 'smooth';
        var pad = parseInt(getComputedStyle(scroller).scrollPaddingTop, 10) || 96;
        if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
          // desktop: the reading pane is its own scroll container
          var top = sec.el.getBoundingClientRect().top
                  - scroller.getBoundingClientRect().top
                  + scroller.scrollTop - pad;
          scroller.scrollTo({ top: Math.max(0, top), behavior: behavior });
        } else {
          // mobile: the page scrolls
          var y = sec.el.getBoundingClientRect().top + window.pageYOffset - pad;
          window.scrollTo({ top: Math.max(0, y), behavior: behavior });
        }
      });
      wrap.appendChild(b);
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
    if (scroller) scroller.scrollTo({ top: 0, behavior: 'auto' });
  }

  function openProject(slug, opts) {
    opts = opts || {};
    if (!panels[slug]) return;
    stopAllDrift();

    var doOpen = function () {
      current = slug;
      app.dataset.view = 'reading';
      if (!railList.children.length) buildRail();
      markActiveRail(slug);
      railList.querySelectorAll('.rail-item__sections').forEach(function (w) { w.innerHTML = ''; });
      fillSections(slug);
      showPanel(slug);
      if (history.replaceState) history.replaceState(null, '', '#' + slug);
      else location.hash = slug;
    };

    var float = floats.find(function (f) { return f.dataset.slug === slug; });

    if (opts.animate === false || reduce || isCompact() || !float) {
      doOpen();
      return;
    }

    // FLIP: clone the card media, fly it to the rail item slot
    var media = float.querySelector('.project-float__media');
    var from = media.getBoundingClientRect();
    float.classList.add('is-launching');

    app.dataset.view = 'reading';
    if (!railList.children.length) buildRail();
    markActiveRail(slug);

    requestAnimationFrame(function () {
      var target = railList.querySelector('.rail-item[data-slug="' + slug + '"]');
      var to = (target || railList).getBoundingClientRect();

      var clone = document.createElement('div');
      clone.className = 'flip-clone';
      clone.style.left = from.left + 'px';
      clone.style.top = from.top + 'px';
      clone.style.width = from.width + 'px';
      clone.style.height = from.height + 'px';
      var img = media.querySelector('.static-image').cloneNode(true);
      clone.appendChild(img);
      document.body.appendChild(clone);

      var sx = Math.max(0.12, (to.width || 40) / from.width);
      var dx = to.left - from.left;
      var dy = to.top + 10 - from.top;

      var anim = clone.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ')', opacity: 0 }
      ], { duration: 460, easing: 'cubic-bezier(0.5,0,0.2,1)' });

      var revealed = false;
      var reveal = function () {
        if (revealed) return;
        revealed = true;
        fillSections(slug);
        showPanel(slug);
        current = slug;
        if (history.replaceState) history.replaceState(null, '', '#' + slug);
      };
      var cleanup = function () {
        reveal();
        if (clone.parentNode) clone.remove();
        float.classList.remove('is-launching');
      };

      // reveal reading content slightly before the clone lands
      setTimeout(reveal, 200);
      anim.onfinish = cleanup;
      // safety net if the WAAPI callback never fires (throttled tab, interruption)
      setTimeout(cleanup, 900);
    });
  }

  function backToCards() {
    current = null;
    app.dataset.view = 'cards';
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    else location.hash = '';
    Object.keys(panels).forEach(function (s) { panels[s].hidden = true; });
    floats.forEach(function (f) { f.classList.remove('is-launching'); });
    startAllDrift();
  }

  if (toCardsBtn) toCardsBtn.addEventListener('click', backToCards);

  /* ====================================================================
   * Rail "current section" highlight on scroll
   * ================================================================== */
  function spy() {
    if (!current) return;
    var secs = sectionsFor(panels[current]);
    var ref = (scroller.getBoundingClientRect().top || 0) + 140;
    var idx = 0;
    secs.forEach(function (s, i) {
      if (s.el.getBoundingClientRect().top <= ref) idx = i;
    });
    railList.querySelectorAll('.rail-item.is-active .rail-section')
      .forEach(function (b, i) { b.classList.toggle('is-current', i === idx); });
  }

  if (scroller) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; spy(); });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
  }

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
            e.target.classList.add('is-dragging');
            e.target.style.zIndex = 500;
          },
          move: function (e) {
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
    el.addEventListener('click', function (e) {
      if (el.classList.contains('is-dragging')) return;
      e.preventDefault();
      openProject(el.dataset.slug, { animate: true });
    });
  });

  /* ====================================================================
   * Hash routing
   * ================================================================== */
  function fromHash() {
    var slug = location.hash.replace('#', '');
    if (panels[slug]) openProject(slug, { animate: false });
    else backToCards();
  }

  window.addEventListener('hashchange', function () {
    var slug = location.hash.replace('#', '');
    if (panels[slug] && slug !== current) openProject(slug, { animate: false });
    else if (!panels[slug] && current) backToCards();
  });

  /* ====================================================================
   * Boot
   * ================================================================== */
  buildRail();
  initDrag();
  if (location.hash && panels[location.hash.replace('#', '')]) {
    openProject(location.hash.replace('#', ''), { animate: false });
  } else {
    startAllDrift();
  }
})();
