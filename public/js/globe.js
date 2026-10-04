/**
 * globe.js — interactive wireframe globe for the Projects cards view
 *  - draggable sphere, real project covers tangent to its surface
 *  - click a frame to open that project (dispatches "globe:select" on the
 *    canvas; projects.js listens and routes it through the normal
 *    openProject flow, same as clicking the flat list below the globe)
 *  - window.globe.focusSlug(slug) rotates the matching frame to the front —
 *    this is what the flat project list calls on click, so the globe and
 *    the list stay in sync
 *
 * Adapted from a standalone prototype (sphere interaction + rotation only;
 * the prototype's own placeholder cards/list styling is not used here).
 */
(function () {
  'use strict';

  var canvas = document.getElementById('projects-globe');
  if (!canvas || typeof THREE === 'undefined') return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Real project covers, in the flat (non-categorized) order used by the
  // list in projects.html — index here must match that list's order.
  // `video` covers loop continuously (muted, inline) and are copied into the
  // frame's canvas texture every render.
  var PROJECTS = [
    { slug: 'arch', image: 'images/arch/card.png', video: 'images/arch/card.mp4' },
    { slug: 'tembo', image: 'images/tembo/card.png', video: 'images/tembo/card.mp4' },
    { slug: 'loblaws', image: 'images/pco/COVER.png' },
    { slug: 'sunlife', image: 'images/sunlife/COVER.png' },
    { slug: 'brandmarch', image: 'images/bm/card1.png' },
    { slug: 'sqlite', image: 'images/sqlite/card1.png', video: 'images/sqlite/card.mp4' },
    { slug: 'descript', image: 'images/descript/card.png' },
    { slug: 'command', image: 'images/commandfreak/card.png' }
  ];

  var CONFIG = {
    background: 0x0e0e0e,   // matches --color-background
    lineColor: 0xf4f4f4,    // matches --color-primary
    lineOpacity: 0.45,
    meridians: 24,
    parallels: 12,
    frameWidth: 1.0,         // sphere radius = 1
    frameHeight: 0.68,
    bend: 1,                 // 0 = flat panels, 1 = fully wrapped onto the sphere
    showGrid: false,         // true to show the wireframe again
    frameLatitude: 0.42,
    fill: 0.84,
    idleSpin: 0.0018,
    startTilt: [0.4, -0.5]
  };

  var emit = function (name, i) {
    canvas.dispatchEvent(new CustomEvent(name, { detail: { index: i, project: PROJECTS[i] || null } }));
  };

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setClearColor(CONFIG.background, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CONFIG.background, 1, 10);
  var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  var globeGroup = new THREE.Group();
  scene.add(globeGroup);

  // ---- Wireframe: meridians + parallels on a unit sphere ----
  var P = function (lat, lon) {
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  };
  var pts = [];
  var SEG = 72, H = Math.PI / 2, m, s, k;
  for (m = 0; m < CONFIG.meridians; m++) {
    var lon = m / CONFIG.meridians * Math.PI * 2;
    for (s = 0; s < SEG; s++) {
      pts.push.apply(pts, P(-H + s / SEG * Math.PI, lon));
      pts.push.apply(pts, P(-H + (s + 1) / SEG * Math.PI, lon));
    }
  }
  for (k = 1; k < CONFIG.parallels; k++) {
    var lat = -H + k / CONFIG.parallels * Math.PI;
    for (s = 0; s < SEG; s++) {
      pts.push.apply(pts, P(lat, s / SEG * Math.PI * 2));
      pts.push.apply(pts, P(lat, (s + 1) / SEG * Math.PI * 2));
    }
  }
  var wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  var grid = new THREE.LineSegments(wireGeo,
    new THREE.LineBasicMaterial({ color: CONFIG.lineColor, transparent: true, opacity: CONFIG.lineOpacity }));
  grid.visible = CONFIG.showGrid;
  globeGroup.add(grid);

  // ---- Frames: real project covers, tangent to the sphere, two staggered rings ----
  var frames = [];
  // Panel subdivided and bent onto a sphere of radius r, so covers lie over the globe.
  function curvedPanel(w, h, r, bend) {
    var g = new THREE.PlaneGeometry(w, h, 32, 24), pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), a = x / r, b = y / r;
      var wx = r * Math.sin(a) * Math.cos(b), wy = r * Math.sin(b), wz = r * Math.cos(a) * Math.cos(b) - r;
      pos.setXYZ(i, x + (wx - x) * bend, y + (wy - y) * bend, wz * bend);
    }
    pos.needsUpdate = true;
    return g;
  }
  var frameGeo = curvedPanel(CONFIG.frameWidth, CONFIG.frameHeight, 1.03, CONFIG.bend);
  var backMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide });
  var perRing = Math.ceil(PROJECTS.length / 2);
  var animatedCovers = [];

  // Frame corner radius: 8px on a ~300px-wide frame, as a fraction of the cover width.
  var CORNER = 0.027;
  function paintCover(ctx, src, w, h, sx, sy, sw, sh) {
    var r = w * CORNER;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.clip();
    if (!sw) {
      sx = 0; sy = 0;
      sw = src.naturalWidth || src.videoWidth; sh = src.naturalHeight || src.videoHeight;
    }
    // crop to the frame's aspect so covers fill it without stretching
    var ta = w / h;
    if (sw / sh > ta) { var nw = sh * ta; sx += (sw - nw) / 2; sw = nw; }
    else { var nh = sw / ta; sy += (sh - nh) / 2; sh = nh; }
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
  }

  var TEX_W = 1600, TEX_H = Math.round(1600 * CONFIG.frameHeight / CONFIG.frameWidth);

  // Covers are drawn into a canvas so the rounded corners are baked in
  // (alphaTest cuts the corners out). Animated covers (GIFs) keep their
  // <img> in the DOM so the browser keeps decoding frames, and the canvas
  // is repainted every render.
  function loadCover(proj, mat) {
    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d');
    var entry = { cv: cv, ctx: ctx, texture: null };
    function attach(w, h) {
      cv.width = w; cv.height = h;
      entry.texture = new THREE.CanvasTexture(cv);
      entry.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      mat.color.set(0xffffff);
      mat.map = entry.texture;
      mat.transparent = true;
      mat.alphaTest = 0.5;
      mat.needsUpdate = true;
    }

    if (proj.video) {
      var video = document.createElement('video');
      video.muted = true; video.loop = true; video.playsInline = true; video.autoplay = true;
      video.setAttribute('aria-hidden', 'true');
      video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
      video.onloadeddata = function () { attach(TEX_W, TEX_H); };
      video.oncanplay = function () { video.play().catch(function () {}); };
      video.src = proj.video;
      document.body.appendChild(video);
      entry.video = video;
      animatedCovers.push(entry);
      return entry;
    }

    var img = new Image();
    img.onload = function () {
      attach(TEX_W, TEX_H);
      paintCover(ctx, img, cv.width, cv.height);
      entry.texture.needsUpdate = true;
    };
    img.src = proj.image;
    return entry;
  }

  PROJECTS.forEach(function (proj, i) {
    var ring = i % 2;
    var lat = (ring ? -1 : 1) * CONFIG.frameLatitude;
    var lon = (Math.floor(i / 2) / perRing + ring / (perRing * 2)) * Math.PI * 2;
    var c = P(lat, lon);
    var n = new THREE.Vector3(c[0], c[1], c[2]);
    var mat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
    var mesh = new THREE.Mesh(frameGeo, mat);
    mesh.position.copy(n).multiplyScalar(1.03);
    mesh.lookAt(n.clone().multiplyScalar(3));
    mesh.add(new THREE.Mesh(frameGeo, backMat));
    mesh.userData = { i: i, slug: proj.slug, hover: 0 };
    globeGroup.add(mesh);
    frames.push(mesh);
    loadCover(proj, mat);
  });

  globeGroup.quaternion.setFromEuler(new THREE.Euler(CONFIG.startTilt[0], CONFIG.startTilt[1], 0));

  // ---- Sizing: follows the canvas' CSS box ----
  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    var d = (1 / CONFIG.fill) / Math.tan(THREE.MathUtils.degToRad(17.5)) / Math.min(1, camera.aspect);
    camera.position.set(0, 0, d);
    scene.fog.near = d - 0.5; scene.fog.far = d + 1.5;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas); resize();

  // ---- Interaction ----
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  var X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  var vx = 0, vy = 0, drag = null, target = null, idle = true, hover = -1, selected = -1;
  var onSettled = null;

  var spin = function (dx, dy) {
    globeGroup.quaternion.premultiply(q.setFromAxisAngle(Y, dx)).premultiply(q.setFromAxisAngle(X, dy)).normalize();
  };

  function pick(e) {
    var r = canvas.getBoundingClientRect();
    mouse.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    var hit = ray.intersectObjects(frames, false)[0];
    return hit ? hit.object.userData.i : -1;
  }
  function setHover(i) {
    if (i === hover) return;
    hover = i; canvas.classList.toggle('hot', i >= 0); emit('globe:hover', i);
  }
  // done() runs once the sphere has rotated to frame i (immediately next frame if it's already there).
  function focus(i, done) {
    if (i < 0 || i >= frames.length) return;
    selected = i; vx = vy = 0; idle = false;
    target = frames[i].quaternion.clone().invert();
    onSettled = done || null;
    if (globeGroup.quaternion.angleTo(target) < 0.002) {
      target = null;
      if (onSettled) requestAnimationFrame(onSettled);
      onSettled = null;
    }
  }
  function indexForSlug(slug) {
    for (var i = 0; i < PROJECTS.length; i++) if (PROJECTS[i].slug === slug) return i;
    return -1;
  }

  canvas.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    target = null; vx = vy = 0; onSettled = null;
    canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (drag) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      vx = dx * 0.006; vy = dy * 0.006; spin(vx, vy); idle = false;
    } else setHover(pick(e));
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var click = drag.moved < 6; drag = null; canvas.classList.remove('dragging');
    if (click) {
      var i = pick(e);
      if (i >= 0) focus(i, function () { emit('globe:select', i); });
    }
  });
  canvas.addEventListener('pointercancel', function () { drag = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('pointerleave', function () { setHover(-1); });

  // ---- Public API ----
  window.globe = {
    focus: focus,
    focusSlug: function (slug, done) { focus(indexForSlug(slug), done); },
    clear: function () { selected = -1; target = null; idle = true; },
    get selected() { return selected; }
  };

  // ---- Loop ----
  (function tick() {
    if (target) {
      if (reduced) { globeGroup.quaternion.copy(target); target = null; }
      else { globeGroup.quaternion.slerp(target, 0.09); if (globeGroup.quaternion.angleTo(target) < 0.002) target = null; }
      if (!target && onSettled) { var done = onSettled; onSettled = null; done(); }
    } else if (!drag) {
      spin(vx, vy); vx *= 0.94; vy *= 0.94;
      if (idle && selected < 0 && !reduced) vx += (CONFIG.idleSpin - vx) * 0.05;
    }
    var now = performance.now();
    animatedCovers.forEach(function (a) {
      if (!a.texture) return;
      if (a.video.readyState < 2) return;
      paintCover(a.ctx, a.video, a.cv.width, a.cv.height);
      a.texture.needsUpdate = true;
    });
    frames.forEach(function (f) {
      var on = (f.userData.i === hover || f.userData.i === selected) ? 1 : 0;
      f.userData.hover += (on - f.userData.hover) * 0.2;
      f.scale.setScalar(1 + 0.1 * f.userData.hover);
      f.material.color.setScalar(0.85 + 0.15 * f.userData.hover);
    });
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  })();
})();
