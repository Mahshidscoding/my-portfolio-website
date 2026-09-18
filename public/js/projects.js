/**
 * projects.js — Projects SPA
 *  - cards view: a static, categorized project list (click a card -> reading view opens)
 *  - reading view: left rail (flat project navigation) + scrolling panel
 *  - switch projects without a page reload
 *  - #slug hash routing + "All projects" button back to the cards view
 */
(function () {
  'use strict';

  var app = document.querySelector('.projects-app');
  var cardsList = document.querySelector('.cards-list');
  var railList = document.querySelector('.rail-list');
  var panelsWrap = document.querySelector('.reading-panels');
  var toCardsBtn = document.querySelector('.to-cards');
  if (!app || !cardsList || !panelsWrap) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll('.project-tile'));
  var panels = {};
  Array.prototype.forEach.call(panelsWrap.querySelectorAll('.project-panel'), function (p) {
    panels[p.dataset.slug] = p;
  });

  var SLUGS = cards.map(function (c) { return c.dataset.slug; });
  var current = null;

  /* ====================================================================
   * Password-protected projects — gated by a centered modal shown on top
   * of whatever view is currently open (cards or reading). Click outside
   * the card, or Escape, dismisses it without opening the project.
   * ================================================================== */
  var PROTECTED_PASSWORDS = { loblaws: 'password2026', sunlife: 'password2026' };
  var UNLOCK_KEY_PREFIX = 'project-unlocked:';

  var passwordModal = document.querySelector('[data-password-modal]');
  var passwordModalInput = passwordModal && passwordModal.querySelector('[data-lock-input]');
  var passwordModalError = passwordModal && passwordModal.querySelector('[data-lock-error]');
  var pendingSlug = null;

  function isProtected(slug) {
    return Object.prototype.hasOwnProperty.call(PROTECTED_PASSWORDS, slug);
  }

  function isUnlocked(slug) {
    try { return sessionStorage.getItem(UNLOCK_KEY_PREFIX + slug) === '1'; }
    catch (e) { return false; }
  }

  function markUnlocked(slug) {
    try { sessionStorage.setItem(UNLOCK_KEY_PREFIX + slug, '1'); } catch (e) {}
  }

  function revealProtectedContent(slug) {
    var panel = panels[slug];
    if (!panel) return;
    var template = panel.querySelector('[data-protected-content]');
    if (template) {
      panel.insertBefore(template.content.cloneNode(true), template);
      template.remove();
    }
  }

  function openPasswordModal(slug) {
    if (!passwordModal) return;
    pendingSlug = slug;
    passwordModalError.hidden = true;
    passwordModalInput.value = '';
    passwordModal.hidden = false;
    passwordModalInput.focus();
  }

  function closePasswordModal() {
    if (!passwordModal) return;
    passwordModal.hidden = true;
    if (pendingSlug && pendingSlug !== current && location.hash.replace('#', '') === pendingSlug) {
      if (history.replaceState) history.replaceState(null, '', location.pathname);
      else location.hash = '';
    }
    pendingSlug = null;
  }

  function shakePasswordModal() {
    passwordModal.classList.remove('is-shake');
    void passwordModal.offsetWidth;
    passwordModal.classList.add('is-shake');
  }

  var passwordModalSubmit = passwordModal && passwordModal.querySelector('[data-lock-submit]');

  function trySubmitPassword() {
    if (!pendingSlug) return;
    var slug = pendingSlug;
    if (passwordModalInput.value === PROTECTED_PASSWORDS[slug]) {
      markUnlocked(slug);
      revealProtectedContent(slug);
      closePasswordModal();
      doOpenProject(slug);
    } else {
      passwordModalError.hidden = false;
      shakePasswordModal();
      passwordModalInput.value = '';
    }
  }

  if (passwordModal) {
    passwordModal.addEventListener('click', function (e) {
      if (e.target === passwordModal) closePasswordModal();
    });
    passwordModalInput.addEventListener('input', function () {
      passwordModalError.hidden = true;
    });
    passwordModalInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') trySubmitPassword();
    });
    if (passwordModalSubmit) {
      passwordModalSubmit.addEventListener('click', function () {
        trySubmitPassword();
        passwordModalInput.focus();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !passwordModal.hidden) closePasswordModal();
    });
  }

  /* ====================================================================
   * Build the rail
   * ================================================================== */
  var RAIL_DOTS = ['#e389ac', '#6b8afd', '#a77bd6', '#6fae82', '#e8a95a', '#7cc3d6'];

  function nameFor(slug) {
    var card = cards.find(function (c) { return c.dataset.slug === slug; });
    return card ? card.querySelector('.project-tile__name').textContent : slug;
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

  function doOpenProject(slug) {
    if (!panels[slug]) return;
    if (slug === current && app.dataset.view === 'reading') return;

    closePasswordModal();
    current = slug;
    app.dataset.view = 'reading';
    if (!railList.children.length) buildRail();
    markActiveRail(slug);
    showPanel(slug);
    if (history.replaceState) history.replaceState(null, '', '#' + slug);
    else location.hash = slug;
  }

  function openProject(slug) {
    if (!panels[slug]) return;
    if (isProtected(slug) && !isUnlocked(slug)) {
      openPasswordModal(slug);
      return;
    }
    doOpenProject(slug);
  }

  function backToCards() {
    current = null;
    app.dataset.view = 'cards';
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    else location.hash = '';
    Object.keys(panels).forEach(function (s) { panels[s].hidden = true; });
    window.scrollTo({ top: 0, behavior: 'auto' });
    closePasswordModal();
  }

  if (toCardsBtn) toCardsBtn.addEventListener('click', backToCards);

  /* ====================================================================
   * Cards — click / keyboard to open
   * ================================================================== */
  cards.forEach(function (el) {
    el.addEventListener('click', function () { openProject(el.dataset.slug); });
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
  Object.keys(PROTECTED_PASSWORDS).forEach(function (slug) {
    if (isUnlocked(slug)) revealProtectedContent(slug);
  });
  buildRail();
  buildNextButtons();
  if (location.hash && panels[location.hash.replace('#', '')]) {
    openProject(location.hash.replace('#', ''));
  }
})();
