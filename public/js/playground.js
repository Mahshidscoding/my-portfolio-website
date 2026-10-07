/**
 * playground.js — Playground SPA
 *  - folders view (landing): one folder per category (art / branding /
 *    experiments); each folder's stacked cover images + count badge are
 *    built from the .project-float cards that share its data-folder
 *  - cards view: floating, draggable project cards (interact.js) with a
 *    gentle idle drift (GSAP) — the same interaction the very first
 *    Projects SPA build used, kept here to feel deliberately looser/more
 *    playful than the Projects page's static tile grid
 *  - reading view: left rail (flat project navigation) + scrolling panel,
 *    each panel just a title, a short description, and one image
 *  - switch projects without a page reload
 *  - #folder / #slug hash routing; "Back to folder" returns to the cards
 *    view, the "Playground" crumb returns to the folders
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
  var toFoldersBtn = document.querySelector('.to-folders');
  var folderTitle = document.querySelector('.folder-bar__title');
  var folderEmpty = document.querySelector('.folder-empty');
  if (!app || !stage || !panelsWrap) return;

  var floats = Array.prototype.slice.call(document.querySelectorAll('.project-float'));
  var panels = {};
  Array.prototype.forEach.call(panelsWrap.querySelectorAll('.project-panel'), function (p) {
    panels[p.dataset.slug] = p;
  });

  var folderEls = Array.prototype.slice.call(document.querySelectorAll('.pg-folder'));
  var folders = {};
  folderEls.forEach(function (el) { folders[el.dataset.folder] = el; });

  var current = null;
  var currentFolder = null;
  var drifts = {};
  var dragMoved = {}; // slug -> cumulative px moved this pointer-down, to tell a drag from a tap
  var DRAG_THRESHOLD = 6;

  /* ====================================================================
   * Build the rail
   * ================================================================== */
  var RAIL_DOTS = ['#e389ac', '#6b8afd', '#a77bd6', '#6fae82', '#e8a95a', '#7cc3d6'];

  function floatFor(slug) {
    return floats.find(function (f) { return f.dataset.slug === slug; });
  }

  function folderOf(slug) {
    var float = floatFor(slug);
    return float ? float.dataset.folder : null;
  }

  // slugs in the open folder, in card order — drives the rail, "Next" and drift
  function folderSlugs() {
    return floats.filter(function (f) { return f.dataset.folder === currentFolder; })
      .map(function (f) { return f.dataset.slug; });
  }

  function folderName(folder) {
    var el = folders[folder];
    return el ? el.querySelector('.pg-folder__name').textContent : folder;
  }

  function nameFor(slug) {
    var float = floatFor(slug);
    return float ? float.querySelector('.project-float__name').textContent : slug;
  }

  function buildRail() {
    railList.innerHTML = '';
    folderSlugs().forEach(function (slug, i) {
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
   * "Next project" button — bottom of every panel, wraps around the
   * projects in the open folder (hidden when the folder has only one)
   * ================================================================== */
  function nextSlugFor(slug) {
    var slugs = folderSlugs();
    var i = slugs.indexOf(slug);
    return slugs.length > 1 && i > -1 ? slugs[(i + 1) % slugs.length] : null;
  }

  function buildNextButtons() {
    Object.keys(panels).forEach(function (slug) {
      var btn = panels[slug].querySelector('[data-next-project]');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var nextSlug = nextSlugFor(slug);
        if (nextSlug) openProject(nextSlug);
      });
    });
  }

  function refreshNextButton(slug) {
    var btn = panels[slug].querySelector('[data-next-project]');
    if (!btn) return;
    var nextSlug = nextSlugFor(slug);
    btn.hidden = !nextSlug;
    if (nextSlug) btn.querySelector('.next-project__name').textContent = nameFor(nextSlug);
  }

  /* ====================================================================
   * Folder covers — up to 3 project images per folder (front, then the
   * two fanned behind it), plus the count badge
   * ================================================================== */
  function buildFolders() {
    folderEls.forEach(function (el) {
      var items = floats.filter(function (f) { return f.dataset.folder === el.dataset.folder; });
      var slots = ['front', 'left', 'right'];
      slots.forEach(function (slot, i) {
        var card = el.querySelector('.pg-folder__card--' + slot);
        var img = items[i] && items[i].querySelector('.project-float__media img');
        card.innerHTML = '';
        card.classList.toggle('is-empty', !img);
        if (img) {
          var copy = document.createElement('img');
          copy.src = img.getAttribute('src');
          copy.alt = '';
          copy.draggable = false;
          card.appendChild(copy);
        }
      });
      var count = el.querySelector('.pg-folder__count');
      count.textContent = items.length;
      count.hidden = !items.length;
      el.setAttribute('aria-label', folderName(el.dataset.folder) + ', ' +
        items.length + (items.length === 1 ? ' project' : ' projects'));
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
    if (folderOf(slug) !== currentFolder || !railList.children.length) {
      currentFolder = folderOf(slug);
      buildRail();
    }
    current = slug;
    app.dataset.view = 'reading';
    markActiveRail(slug);
    refreshNextButton(slug);
    showPanel(slug);
    if (history.replaceState) history.replaceState(null, '', '#' + slug);
    else location.hash = slug;
  }

  function setHash(hash) {
    if (history.replaceState) history.replaceState(null, '', hash ? '#' + hash : location.pathname);
    else location.hash = hash;
  }

  function openFolder(folder) {
    if (!folders[folder]) return;
    stopAllDrift();
    current = null;
    currentFolder = folder;
    app.dataset.view = 'cards';
    var slugs = folderSlugs();
    floats.forEach(function (f) { f.hidden = f.dataset.folder !== folder; });
    if (folderTitle) folderTitle.textContent = folderName(folder);
    if (folderEmpty) folderEmpty.hidden = slugs.length > 0;
    stage.hidden = !slugs.length;
    buildRail();
    setHash(folder);
    Object.keys(panels).forEach(function (s) { panels[s].hidden = true; });
    window.scrollTo({ top: 0, behavior: 'auto' });
    startAllDrift();
  }

  function backToFolders() {
    stopAllDrift();
    current = null;
    currentFolder = null;
    app.dataset.view = 'folders';
    setHash('');
    Object.keys(panels).forEach(function (s) { panels[s].hidden = true; });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (toCardsBtn) toCardsBtn.addEventListener('click', function () {
    if (currentFolder) openFolder(currentFolder);
    else backToFolders();
  });
  if (toFoldersBtn) toFoldersBtn.addEventListener('click', backToFolders);

  folderEls.forEach(function (el) {
    el.addEventListener('click', function () { openFolder(el.dataset.folder); });
  });

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
    var el = floatFor(slug);
    if (!el || el.hidden || drifts[slug]) return;
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

  function startAllDrift() { folderSlugs().forEach(function (s) { setTimeout(function () { startDrift(s); }, Math.random() * 600); }); }
  function stopAllDrift() { Object.keys(drifts).forEach(stopDrift); }

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
  function route() {
    var hash = location.hash.replace('#', '');
    if (panels[hash] && folderOf(hash)) {
      if (hash !== current) openProject(hash);
    } else if (folders[hash]) {
      if (hash !== currentFolder || current) openFolder(hash);
    } else if (app.dataset.view !== 'folders') {
      backToFolders();
    }
  }

  window.addEventListener('hashchange', route);

  /* ====================================================================
   * Boot
   * ================================================================== */
  buildFolders();
  buildNextButtons();
  initDrag();
  route();
})();
