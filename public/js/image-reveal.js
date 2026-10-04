/**
 * image-reveal.js — wave wipe reveal for project images
 *  - each image's frame (its parent) and the image itself are wiped in by a
 *    wavy line that sweeps down; the frame leads, the image follows
 *  - plays once per image, the first time half of it is on screen, and then
 *    stays revealed (no reverse)
 *  - window.imageReveal.init(root) wires up images inside `root` (call again
 *    after content is revealed dynamically, e.g. password-protected panels)
 *  - window.imageReveal.refresh() checks visibility (call on show/resize)
 */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var N = 12;                // points along the wave
  var MAX_WAVE_PX = 10;      // max wave height
  var DURATION = 1200;       // ms
  var IMAGE_DELAY = 50;      // ms the image starts after the frame
  var VISIBLE_RATIO = 0.2;   // play once this much of the image is on screen
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  var defs = document.createElementNS(SVGNS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);

  var clipSeq = 0;
  function makeClip() {
    var id = 'image-reveal-' + (clipSeq++);
    var cp = document.createElementNS(SVGNS, 'clipPath');
    cp.setAttribute('id', id);
    cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
    var path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', 'M 0 0 Z');
    cp.appendChild(path);
    defs.appendChild(cp);
    return { id: id, path: path };
  }

  function buildPath(progress, offsets, w, h) {
    var baseY = progress * h;                 // line moves top -> bottom
    var amp = Math.sin(progress * Math.PI);   // flat -> wavy -> flat
    var pts = offsets.map(function (o) { return baseY + o * amp; });
    var step = w / (N - 1);
    var d = 'M 0 ' + pts[0];
    for (var i = 1; i < N; i++) {
      var x1 = i * step;
      var xm = x1 - step / 2;
      d += ' C ' + xm + ' ' + pts[i - 1] + ' ' + xm + ' ' + pts[i] + ' ' + x1 + ' ' + pts[i];
    }
    return d + ' V 0 H 0 Z';
  }

  function randomOffsets() {
    var out = [];
    for (var i = 0; i < N; i++) out.push((Math.random() * 2 - 1) * MAX_WAVE_PX);
    return out;
  }

  // power2.inOut
  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  // Changing a clip path's geometry alone doesn't always repaint the element,
  // so the clip reference is re-applied after each update.
  function repaint(el) {
    var clip = el.style.clipPath;
    el.style.clipPath = 'none';
    el.style.clipPath = clip;
  }

  function Reveal(img) {
    var frame = img.parentElement;
    var frameClip = makeClip();
    var imgClip = makeClip();
    frame.style.background = 'var(--color-surface)';
    frame.style.clipPath = frame.style.webkitClipPath = 'url(#' + frameClip.id + ')';
    img.style.clipPath = img.style.webkitClipPath = 'url(#' + imgClip.id + ')';

    this.img = img;
    this.frame = frame;
    this.frameClip = frameClip;
    this.imgClip = imgClip;
    this.offsets = randomOffsets();
    this.fw = 0; this.fh = 0; this.iw = 0; this.ih = 0;
    this.startedAt = null;
    this.done = false;
    this.setProgress(0, 0);
  }

  Reveal.prototype.measure = function () {
    var fr = this.frame.getBoundingClientRect();
    var ir = this.img.getBoundingClientRect();
    this.fw = fr.width; this.fh = fr.height;
    this.iw = ir.width; this.ih = ir.height;
  };

  Reveal.prototype.setProgress = function (frameP, imgP) {
    this.frameClip.path.setAttribute('d', buildPath(frameP, this.offsets, this.fw, this.fh));
    this.imgClip.path.setAttribute('d', buildPath(imgP, this.offsets, this.iw, this.ih));
    repaint(this.frame);
    repaint(this.img);
  };

  Reveal.prototype.tick = function (now) {
    var elapsed = now - this.startedAt;
    var frameP = ease(clamp01(elapsed / DURATION));
    var imgP = ease(clamp01((elapsed - IMAGE_DELAY) / DURATION));
    this.setProgress(frameP, imgP);
    return imgP < 1;
  };

  var reveals = [];
  var animating = [];
  var loopRunning = false;

  function loop(now) {
    animating = animating.filter(function (r) { return r.tick(now); });
    if (animating.length) requestAnimationFrame(loop);
    else loopRunning = false;
  }

  function start(r) {
    r.done = true;
    if (reduce) {
      r.setProgress(1, 1);
      return;
    }
    r.startedAt = performance.now();
    animating.push(r);
    if (!loopRunning) {
      loopRunning = true;
      requestAnimationFrame(loop);
    }
  }

  // Half of the image's height is inside the viewport.
  function halfVisible(rect) {
    var visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    return rect.height > 0 && visible >= rect.height * VISIBLE_RATIO;
  }

  function refresh() {
    reveals.forEach(function (r) {
      if (r.done || r.img.getClientRects().length === 0) return;
      r.measure();
      if (halfVisible(r.img.getBoundingClientRect())) start(r);
    });
  }

  var queued = false;
  function queueRefresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; refresh(); });
  }

  window.addEventListener('scroll', queueRefresh, { passive: true });
  window.addEventListener('resize', queueRefresh);

  function init(root) {
    var imgs = (root || document).querySelectorAll('.projects-container img');
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.dataset.reveal === 'on') return;
      img.dataset.reveal = 'on';
      reveals.push(new Reveal(img));
      img.addEventListener('load', queueRefresh);
    });
    refresh();
  }

  window.imageReveal = { init: init, refresh: queueRefresh };
  init(document);
})();
