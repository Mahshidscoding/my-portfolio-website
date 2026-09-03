/**
 * site.js — shared behaviour for every page
 *  - custom cursor (single implementation, replaces the old per-page copies)
 *  - nav info-box: copy email / book call
 *  - smooth page-load reveal
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------------------
   * 1. Custom cursor
   * -------------------------------------------------------------------- */
  function initCursor() {
    var cursor = document.querySelector('.cursor');
    if (!cursor || window.matchMedia('(pointer: coarse)').matches) return;

    var x = window.innerWidth / 2;
    var y = window.innerHeight / 2;

    document.addEventListener('mousemove', function (e) {
      x = e.clientX;
      y = e.clientY;
    });

    (function frame() {
      cursor.style.left = x + 'px';
      cursor.style.top = y + 'px';
      requestAnimationFrame(frame);
    })();

    var grow = 'a, button, .project-card, .nav-contact-row, .nav-info__links a,' +
      ' .project-float, .rail-item, .rail-section, .to-cards, .jump-link';
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest(grow)) {
        cursor.style.width = '60px';
        cursor.style.height = '24px';
        cursor.style.borderRadius = '12px';
      }
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest(grow)) {
        cursor.style.width = '24px';
        cursor.style.height = '24px';
        cursor.style.borderRadius = '50%';
      }
    });
  }

  /* ----------------------------------------------------------------------
   * 2. Nav contact actions
   * -------------------------------------------------------------------- */
  function initNavContact() {
    var navInfo = document.querySelector('.nav-info');
    var contactLabel = document.querySelector('.nav-info__contact');

    var panel = document.querySelector('.nav-contact-panel');
    if (navInfo && contactLabel && panel) {
      // Panel opens while the Contact label OR the open panel is hovered.
      // A short close-delay lets the pointer travel from the label to the panel.
      var closeTimer = null;
      var open = function () {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        navInfo.classList.add('show-contact');
      };
      var scheduleClose = function () {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = setTimeout(function () {
          navInfo.classList.remove('show-contact');
          closeTimer = null;
        }, 140);
      };
      var closeNow = function () {
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
        navInfo.classList.remove('show-contact');
      };

      [contactLabel, panel].forEach(function (el) {
        el.addEventListener('pointerenter', open);
        el.addEventListener('pointerleave', scheduleClose);
      });
      // hovering the other tabs, or leaving the whole box, closes immediately
      navInfo.querySelectorAll('.nav-info__links a').forEach(function (a) {
        a.addEventListener('pointerenter', closeNow);
      });
      navInfo.addEventListener('pointerleave', scheduleClose);

      // keyboard
      contactLabel.addEventListener('focus', open);
      navInfo.addEventListener('focusout', function (e) {
        if (!navInfo.contains(e.relatedTarget)) closeNow();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeNow();
      });
    }

    // bio text collapses once you leave the very top of the page,
    // and slides back down when you return to the top
    if (navInfo) {
      var sync = function (y) {
        navInfo.classList.toggle('is-condensed', y > 24);
      };
      sync(window.scrollY || 0);
      window.addEventListener('scroll', function () {
        sync(window.scrollY || 0);
      }, { passive: true });
      // projects.html scrolls inside .reading-scroll, not the window
      document.querySelectorAll('.reading-scroll').forEach(function (sc) {
        sc.addEventListener('scroll', function () { sync(sc.scrollTop); }, { passive: true });
      });
    }

    var copyBtn = document.getElementById('nav-copy-email');
    if (copyBtn) {
      copyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var label = copyBtn.querySelector('.nav-contact-row__label');
        var original = label ? label.textContent : '';
        navigator.clipboard.writeText('mahshidmdnn@gmail.com').then(function () {
          copyBtn.classList.add('is-copied');
          if (label) label.textContent = 'Copied!';
          setTimeout(function () {
            copyBtn.classList.remove('is-copied');
            if (label) label.textContent = original;
          }, 1200);
        }).catch(function () {});
      });
    }
  }

  /* ----------------------------------------------------------------------
   * 3. Page-load reveal
   * -------------------------------------------------------------------- */
  function initReveal() {
    // stagger the reveal blocks (CSS handles the actual animation)
    document.querySelectorAll('[data-reveal]').forEach(function (el, i) {
      el.style.setProperty('--reveal-i', Math.min(i, 6));
    });
  }

  /* ----------------------------------------------------------------------
   * 4. In-page smooth scroll for hash links (non-router pages)
   * -------------------------------------------------------------------- */
  function initSmoothHash() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]:not([data-router])');
      if (!link) return;
      var id = link.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initCursor();
    initNavContact();
    initReveal();
    initSmoothHash();
  });
})();
