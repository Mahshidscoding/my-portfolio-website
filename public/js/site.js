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
    var hidden = false;

    document.addEventListener('mousemove', function (e) {
      x = e.clientX;
      y = e.clientY;
      // only a flower itself swaps in the real OS watering-can cursor —
      // hide the custom dot there; everywhere else in the hero keeps it
      var overPlant = !!(e.target && e.target.closest && e.target.closest('.garden-plant'));
      if (overPlant !== hidden) {
        hidden = overPlant;
        cursor.style.opacity = hidden ? '0' : '1';
      }
    });

    (function frame() {
      cursor.style.left = x + 'px';
      cursor.style.top = y + 'px';
      requestAnimationFrame(frame);
    })();

    var grow = 'a, button, .project-tile, .nav-contact-row, .nav-info__links a,' +
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
        cursor.style.width = '16px';
        cursor.style.height = '16px';
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
   * 2b. Nav auto-dim on scroll
   *     Scrolling down fades the logo badge + tabs box to near-zero
   *     opacity; scrolling up restores them; hovering while dimmed also
   *     restores them (handled purely in CSS via :hover).
   * -------------------------------------------------------------------- */
  function initNavAutoDim() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;

    var DOWN_THRESHOLD = 60;   // ignore the first bit of scroll near the top
    var DELTA = 4;             // ignore sub-pixel jitter

    function track(getY) {
      var lastY = getY();
      return function () {
        var y = getY();
        var dy = y - lastY;
        if (y <= DOWN_THRESHOLD || dy < -DELTA) {
          nav.classList.remove('nav-dimmed');
        } else if (dy > DELTA) {
          nav.classList.add('nav-dimmed');
        }
        lastY = y;
      };
    }

    window.addEventListener('scroll', track(function () { return window.scrollY || 0; }), { passive: true });
    // projects.html scrolls inside .reading-scroll, not the window
    document.querySelectorAll('.reading-scroll').forEach(function (sc) {
      sc.addEventListener('scroll', track(function () { return sc.scrollTop; }), { passive: true });
    });
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

  /* ----------------------------------------------------------------------
   * 5. Click sound — a tiny synthesized "tick" for primary buttons + tabs.
   *    No audio file/library: Web Audio API generates it on the fly, so
   *    the sound is just the numbers below, not an asset to re-record.
   * -------------------------------------------------------------------- */
  function initClickSound() {
    var SOUND_SELECTOR = '.intro-cta, .skills-cta-button, .nav-info__links a, .project-tile';

    // --- tweak these to change the sound ---------------------------------
    var TONE_FREQ = 1500;     // Hz — starting pitch of the blip
    var TONE_DECAY_TO = 700;  // Hz — pitch it slides down to
    var TONE_DURATION = 0.05; // seconds
    var TONE_VOLUME = 0.09;   // 0–1
    var TICK_DURATION = 0.02; // seconds — short noise "tick" layered under the blip
    var TICK_VOLUME = 0.06;   // 0–1
    // ----------------------------------------------------------------------

    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = null;
    var noiseBuffer = null;

    function ensureCtx() {
      if (!ctx) ctx = new Ctx();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function getNoiseBuffer(c) {
      if (noiseBuffer) return noiseBuffer;
      var len = Math.ceil(c.sampleRate * TICK_DURATION);
      noiseBuffer = c.createBuffer(1, len, c.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return noiseBuffer;
    }

    function playClick() {
      var c = ensureCtx();
      var now = c.currentTime;

      // tonal blip — gives the click a pitch
      var osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(TONE_FREQ, now);
      osc.frequency.exponentialRampToValueAtTime(TONE_DECAY_TO, now + TONE_DURATION);
      var toneGain = c.createGain();
      toneGain.gain.setValueAtTime(TONE_VOLUME, now);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + TONE_DURATION);
      osc.connect(toneGain).connect(c.destination);
      osc.start(now);
      osc.stop(now + TONE_DURATION + 0.01);

      // noise tick — gives it a tactile, mechanical edge
      var noise = c.createBufferSource();
      noise.buffer = getNoiseBuffer(c);
      var filter = c.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2000;
      var tickGain = c.createGain();
      tickGain.gain.setValueAtTime(TICK_VOLUME, now);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, now + TICK_DURATION);
      noise.connect(filter).connect(tickGain).connect(c.destination);
      noise.start(now);
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest(SOUND_SELECTOR)) playClick();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initCursor();
    initNavContact();
    initNavAutoDim();
    initReveal();
    initSmoothHash();
    initClickSound();
  });
})();
