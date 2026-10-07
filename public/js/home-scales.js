/**
 * home-scales.js — Home page: full-screen WebGL tile grid in iridescent pearl glass.
 *
 * Tile material = playground/pearl-material.js (same shader, same settings);
 * the cursor is the light. Instead of one canvas per tile, every tile is drawn
 * here in a single WebGL canvas with real perspective tilt (same maths as CSS
 * perspective(900px) rotateX() rotateY()), so ~100 tiles stay cheap.
 *
 * The real site nav (.site-nav) floats on top; this script leaves matching
 * empty grid cells under it (logo = as many columns as its text needs, info
 * box = a whole number of columns) and tiles the space beneath them. Only the
 * portrait/bio card is a DOM card sitting in a cell.
 */
(() => {
  // ---------- grid sizing ----------
  // Rows from the height, columns from the aspect ratio; tiles then stretch (staying near-square)
  // so the grid lands exactly on the margins.
  const TARGET = 186, GAP = 8, MARGIN = 32;
  // scroll frames (only when js/home-frames.js is loaded, i.e. index.html): sets window.HOME_FRAMES
  // and fixes the grid size, so the frames' cells mean the same thing on every screen
  const FR = window.HOME_FRAMES || null;
  const NAV_MIN = 300;   // narrowest the nav info box can be (px) before its tabs crowd
  function fitGrid(W, H) {
    const aw = W - 2 * MARGIN, ah = H - 2 * MARGIN;
    const R = FR ? FR.rows : Math.max(3, Math.min(8, Math.round((ah + GAP) / (TARGET + GAP))));
    const th = (ah - (R - 1) * GAP) / R;
    const C = FR ? FR.cols : Math.max(3, Math.round((aw + GAP) / (th + GAP)));
    const tw = (aw - (C - 1) * GAP) / C;
    return { C, R, w: tw, h: th, x: MARGIN, y: MARGIN };
  }

  // pearl glass look — values from PEARL_SETTINGS in playground/pearl-material.js
  const PEARL = {
    iridescence: 1.25,   // rainbow strength
    crinkle: 2.01,       // crinkled-glass depth
    gloss: 1.17,
    lightHeight: 540,    // css px the light (the cursor) sits above the surface
    lightStrength: 0.6,  // scales everything the light adds (diffuse, rainbow sheen, gloss); 1 = the demo's brightness
    radius: 0.11,        // corner radius, × the tile's short side
  };
  // tilt, as in playground/pearl-tilt-demo.html: only the tile under the cursor leans
  const TILT = 20;       // deg at the tile's edge (the demo used 6 — too subtle on the full grid)
  const PERSP = 900;     // css px, like CSS perspective(900px)
  const SMOOTH = 250;    // ms for the lean to settle
  const SHADOW = 0.5;    // drop-shadow strength

  const canvas = document.getElementById('gl');
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- shaders ----------
  const VS = `#version 300 es
in vec2 aCorner;            // 0..1 quad corner
uniform vec2 uRes;          // viewport, css px
uniform vec2 uCenter;       // tile centre on screen, css px
uniform vec2 uRot;          // rx, ry (radians)
uniform vec2 uShift;        // screen offset, css px (shadow pass)
uniform vec2 uSize;         // tile size, css px
uniform float uPersp, uPad;
out vec2 vLocal;            // tile-local css px (0..size)
void main() {
  vec2 local = aCorner * (uSize + 2.0 * uPad) - uPad;
  vLocal = local;
  vec3 p = vec3(local - uSize * 0.5, 0.0);
  // same as CSS perspective(d) rotateX(rx) rotateY(ry): y down, +z toward viewer
  float cy = cos(uRot.y), sy = sin(uRot.y);
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  float cx = cos(uRot.x), sx = sin(uRot.x);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  float w = 1.0 - p.z / uPersp;
  vec2 s = uCenter + uShift + p.xy / w;
  vec2 ndc = vec2(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0);
  gl_Position = vec4(ndc * w, 0.0, w);   // keep w so vLocal interpolates perspective-correct
}
`;

  // pearl glass fragment shader: playground/pearl-material.js, with p = vLocal
  // (tile-local css px, perspective-correct) instead of gl_FragCoord, plus a drop-shadow pass
  const FS = `#version 300 es
precision highp float;
in vec2 vLocal;
out vec4 outColor;

uniform int uPass;          // 0 = drop shadow, 1 = tile, 2 = tile's back (flipped)
uniform float uBackA;       // back opacity
uniform float uShadow;      // drop shadow strength
uniform vec2 uSize;         // tile size, css px
uniform vec2 uSeed;         // per-tile variation
uniform vec3 uLight;        // light, tile-local css px (z = height)
uniform vec2 uRot;          // tile tilt, radians (rx, ry) — shifts the sheen like real glass
uniform float uIri, uRipple, uGloss, uRadius, uLightI;

float hash12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = ROT * p * 2.03 + 7.1; a *= 0.5; }
  return s / 0.9375;
}
float ridge(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * (1.0 - abs(2.0 * vnoise(p) - 1.0)); p = ROT * p * 2.1 + 3.3; a *= 0.5; }
  return s / 0.875;
}

float T;      // reference size (short side)
float sdf(vec2 p) {
  vec2 r = p - uSize * 0.5;
  vec2 q = abs(r) - (uSize * 0.5 - uRadius);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  return d + (vnoise(p * (6.0 / T) + uSeed * 7.0) - 0.5) * T * 0.01;   // slightly hand-cut edge
}
float heightAt(vec2 p) {
  vec2 r = p - uSize * 0.5;
  // pillow: product of per-axis falloffs, so corners round off without mitre creases
  vec2 e = uSize * 0.5 - abs(r);
  vec2 f = smoothstep(vec2(-T * 0.02), vec2(T * 0.26), e);
  float d = sdf(p);
  float shoulder = f.x * f.y * smoothstep(0.0, T * 0.05, -d);
  float x = clamp(-d / (T * 0.24), 0.0, 1.0);
  vec2 uv = r / T + uSeed * 1.37;
  float crinkle = fbm(uv * 3.5) * 0.55 + ridge(uv * 9.0) * 0.45;
  return T * (0.045 * shoulder + uRipple * 0.0045 * crinkle * smoothstep(0.0, 0.5, x));
}
vec3 palette(float h) {
  if (h < 0.22) return vec3(.93, .90, .90);   // pearl
  if (h < 0.48) return vec3(.91, .80, .83);   // blush
  if (h < 0.68) return vec3(.84, .70, .77);   // rose
  if (h < 0.85) return vec3(.78, .70, .82);   // lilac
  return vec3(.70, .56, .68);                 // mauve
}

void main() {
  T = min(uSize.x, uSize.y);
  vec2 p = vLocal;
  float d = sdf(p);

  // ---------- pass 0: soft drop shadow ----------
  if (uPass == 0) {
    float blur = T * 0.13;
    float a = 1.0 - smoothstep(-blur * 0.7, blur, d);
    a *= a;
    outColor = vec4(0.0, 0.0, 0.0, a * uShadow);
    return;
  }

  float alpha = 1.0 - smoothstep(-max(fwidth(d), 0.35), max(fwidth(d), 0.35), d);
  if (alpha <= 0.0) { outColor = vec4(0.0); return; }
  if (uPass == 2) { float a = alpha * uBackA; outColor = vec4(vec3(0.15) * a, a); return; }

  const float E = 0.75;
  float h0 = heightAt(p);
  vec3 N = normalize(vec3(-(heightAt(p + vec2(E, 0)) - h0) / E, -(heightAt(p + vec2(0, E)) - h0) / E, 1.0));
  // follow the tile's CSS tilt: perspective rotateX(rx) rotateY(ry), y down, +z toward viewer
  float cy = cos(uRot.y), sy = sin(uRot.y), cx = cos(uRot.x), sx = sin(uRot.x);
  N = vec3(cy * N.x + sy * N.z, N.y, -sy * N.x + cy * N.z);
  N = vec3(N.x, cx * N.y - sx * N.z, sx * N.y + cx * N.z);

  vec3 L = normalize(uLight - vec3(p, h0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0), ndh = max(dot(N, H), 0.0), ndv = max(N.z, 0.0);

  // pearly base, a little cloudy
  vec2 uv = (p - uSize * 0.5) / T + uSeed * 1.37;
  float hs = hash12(uSeed * 1.7 + 3.1);
  vec3 base = mix(palette(hs), palette(fract(hs * 7.31 + 0.2)), smoothstep(0.3, 0.7, fbm(uv * 1.4)) * 0.6);

  // thin-film iridescence
  float thick = fbm(uv * 1.3 + 11.0);
  float tileIri = mix(0.2, 1.0, pow(hash12(uSeed + 9.1), 1.5));   // some tiles glow, most stay milky
  float mask = uIri * tileIri * smoothstep(0.3, 0.8, fbm(uv * 1.8 + 4.2));
  float phase = thick * 1.6 + ndh * 0.9 + dot(N.xy, L.xy) * 1.5;
  vec3 film = 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.33, 0.67)));
  film.g *= 0.88;
  film = mix(film, vec3(1.0, .86, .92), 0.3);

  vec3 col = base * (0.55 + 0.35 * ndl * uLightI);
  col = mix(col, col * film * 1.2, mask * 0.4);                   // tinted body
  col += film * mask * pow(ndh, 6.0) * 0.35 * uLightI;            // rainbow sheen toward the light
  col += film * mask * pow(1.0 - ndv, 2.0) * 0.35;                // rainbow on shoulders + creases
  col += uLightI * uGloss * (pow(ndh, 40.0 * uGloss + 5.0) * 0.18 + pow(ndh, 300.0) * 0.6);   // gloss + glints
  col += pow(1.0 - ndv, 4.0) * 0.12;                              // fresnel rim
  col *= mix(0.62, 1.0, smoothstep(0.0, 2.0, -d));                // dark contact line at the edge
  col = (1.0 - exp(-col * 1.35)) / (1.0 - exp(-1.35));            // soft roll-off, no clipped whites

  outColor = vec4(col * alpha, alpha);                            // premultiplied
}
`;

  // ---------- gl setup ----------
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) {
    canvas.remove();
    document.getElementById('stage')?.remove();
    document.body.insertAdjacentHTML('afterbegin', '<p class="nogl">This effect needs WebGL2.</p>');
    return;
  }
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const aCorner = gl.getAttribLocation(prog, 'aCorner');
  gl.enableVertexAttribArray(aCorner);
  gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0x16 / 255, 0x16 / 255, 0x16 / 255, 1);

  const U = {};
  for (const n of ['uRes', 'uCenter', 'uRot', 'uShift', 'uSize', 'uPersp', 'uPad', 'uPass', 'uShadow',
                   'uSeed', 'uLight', 'uIri', 'uRipple', 'uGloss', 'uRadius', 'uLightI', 'uBackA']) {
    U[n] = gl.getUniformLocation(prog, n);
  }

  // ---------- tiles ----------
  let seedN = 0;
  // c, r, cs, rs: the grid cells the tile covers (for the scroll frames)
  const makeTile = (x, y, w, h, c, r, cs = 1, rs = 1) => ({
    x0: x, y0: y, w, h, c, r, cs, rs,
    seed: seedN++,               // stable per tile: its own colour + crinkle
    ks: Math.min(1, geo.tile / Math.max(w, h)),   // long tiles lean less
    rx: 0, ry: 0, vx: 0, vy: 0,  // tilt + velocity (deg)
    f: 0, flip: null, hidden: false,   // scroll-frame flip: angle (deg, 180 = face down) + its tween
  });
  let tiles = [], order = [];      // order: draw order, most tilted on top

  // ---------- layout: fill the window with the grid, cards snap to cells ----------
  const geo = { tile: 0, left: 0, top: 0, w: 0, h: 0 };
  const navLogo = document.querySelector('.nav-logo');
  const navInfo = document.querySelector('.nav-info');
  const photo = document.getElementById('c-photo');
  const place = (el, x, y, w, h) => {
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px';
    if (h != null) el.style.height = h + 'px';
  };
  // photo card opens across the 2 × 2 block ending at its own cell, with
  // tabs (close + Being / Doing) floating just above it
  const tabs = document.getElementById('c-tabs');
  const tabBtns = tabs ? [...tabs.querySelectorAll('[role="tab"]')] : [];
  const closeBtn = tabs && tabs.querySelector('.photo-close');
  const TABS_H = 34, TABS_GAP = 8;
  let photoCell = null, photoOpen = false;
  // Being = the full 2 × 2 block; Doing shrinks to its bottom row (one tile tall)
  const openRect = () => (photo.dataset.tab === 'doing' ? photoCell.two : photoCell.four);
  function placePhoto() { place(photo, ...(photoOpen ? openRect() : photoCell.one)); }
  function placeTabs() {
    const [x, y, w] = openRect();
    place(tabs, x, y - TABS_H - TABS_GAP, w, TABS_H);
  }
  function setTab(name) {
    photo.dataset.tab = name;
    tabBtns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    if (photoCell) { placePhoto(); placeTabs(); }
  }
  function setPhoto(open) {
    if (open === photoOpen) return;
    photoOpen = open;
    photo.classList.toggle('open', open);
    tabs.classList.toggle('open', open);
    photo.setAttribute('aria-expanded', open);
    if (!open) setTab('being');           // the closed tile always shows the portrait
    placePhoto();
  }
  if (photo) {
  setTab('being');
  photo.addEventListener('click', e => { if (!photoOpen && !e.target.closest('a')) { setPhoto(true); if (window.playSiteClick) playSiteClick(); } });
  photo.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === photo && !photoOpen) { e.preventDefault(); setPhoto(true); if (window.playSiteClick) playSiteClick(); }
  });
  tabBtns.forEach((b, i) => {
    b.addEventListener('click', () => setTab(b.dataset.tab));
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const n = tabBtns[(i + (e.key === 'ArrowRight' ? 1 : tabBtns.length - 1)) % tabBtns.length];
      n.focus(); setTab(n.dataset.tab);
    });
  });
  closeBtn.addEventListener('click', () => { setPhoto(false); photo.focus(); });
  document.addEventListener('click', e => {
    if (!photo.contains(e.target) && !tabs.contains(e.target)) setPhoto(false);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') setPhoto(false); });
  }

  function layout() {
    const dpr = Math.min(1.5, devicePixelRatio || 1);   // 1.5 is plenty for this texture (and keeps it fast)
    geo.w = innerWidth; geo.h = innerHeight;
    canvas.width = Math.round(geo.w * dpr);
    canvas.height = Math.round(geo.h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const { C, R, w, h, x, y } = fitGrid(geo.w, geo.h);
    geo.left = x; geo.top = y;                  // tiles live in grid space from here
    geo.tile = Math.min(w, h);
    const sx = w + GAP, sy = h + GAP;

    // nav: the name badge takes however many columns its text needs (none on
    // narrow screens, where it's hidden), the info box a whole number of
    // columns on the right
    const logoShown = !!navLogo && getComputedStyle(navLogo).display !== 'none';
    let nameCols = 0, nameW = 0;
    if (logoShown) {
      navLogo.style.minWidth = '';
      nameCols = Math.max(1, Math.ceil((navLogo.offsetWidth + GAP) / sx));
      nameW = nameCols * w + (nameCols - 1) * GAP;
      navLogo.style.minWidth = nameW + 'px';
    }
    const cols = Math.min(C - nameCols, Math.max(2, Math.ceil((NAV_MIN + GAP) / sx)));
    const infoW = cols * w + (cols - 1) * GAP;
    navInfo.style.width = infoW + 'px';
    navInfo.style.maxWidth = 'none';
    const nameH = logoShown ? navLogo.offsetHeight : 0;
    const infoH = navInfo.offsetHeight;

    if (photo) {
    photoCell = { one: [x + (C - 1) * sx, y + (R - 1) * sy, w, h],
                  two:  [x + (C - 2) * sx, y + (R - 1) * sy, 2 * w + GAP, h],
                  four: [x + (C - 2) * sx, y + (R - 2) * sy, 2 * w + GAP, 2 * h + GAP] };
    placePhoto();
    placeTabs();
    }

    seedN = 0;
    const next = [];
    if (logoShown && h - nameH - GAP >= 24) next.push(makeTile(0, nameH + GAP, nameW, h - nameH - GAP, 0, 0, nameCols));  // under the name badge
    if (h - infoH - GAP >= 24) next.push(makeTile((C - cols) * sx, infoH + GAP, infoW, h - infoH - GAP, C - cols, 0, cols)); // under the nav
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (r === 0 && (c < nameCols || c >= C - cols)) continue;
        if (photo && r === R - 1 && c === C - 1) continue;
        next.push(makeTile(c * sx, r * sy, w, h, c, r));
      }
    }
    tiles = next; order = tiles.slice();
    hovered = null;
    if (FR) {
      for (const [id, b] of Object.entries(FR.blocks)) {
        const r = blockRects[id] = [x + b.c * sx, y + b.r * sy, b.w * w + (b.w - 1) * GAP, b.h * h + (b.h - 1) * GAP];
        if (blockEls[id]) place(blockEls[id], ...r);
      }
      syncFrame(true);   // new tiles start in the current frame's state, no flip
      renderFly();
    }
    kick();
  }

  // ---------- scroll frames ----------
  // HOME_FRAMES.blocks are rectangles of cells (some holding text);
  // HOME_FRAMES.frames lists which blocks are open at each scroll step. Each
  // step: tiles over an open block flip away (rotateX, their dark back fading
  // as it lies flat), tiles no longer covered flip back, then the text fades in.
  const FLIP_MS = 800;      // one tile's flip
  const STAGGER_MS = 260;   // spread of start times, top → bottom in the scroll direction
  let frameIdx = 0, flipDir = 1;
  const blockEls = {}, blockRects = {};
  let frameLayer = null, flyLayer = null;
  if (FR) {
    flyLayer = document.createElement('div');
    flyLayer.className = 'fly-layer';
    document.querySelector('main').appendChild(flyLayer);
    frameLayer = document.createElement('div');
    frameLayer.className = 'frame-layer';
    for (const [id, b] of Object.entries(FR.blocks)) {
      if (!b.html) continue;
      const el = document.createElement('div');
      el.className = 'frame-block ' + (b.cls || '');
      el.innerHTML = b.html;
      frameLayer.appendChild(el);
      blockEls[id] = el;
    }
    document.querySelector('main').appendChild(frameLayer);
  }
  // ---------- light on the bio paragraph ----------
  // The paragraph sits dim; a soft circle of it lights up around the cursor.
  // The light trails the cursor slowly and swells in / fades out when the
  // cursor comes near or leaves (CSS: .fr-para p).
  const LIGHT_R = 150;        // px, radius of the lit circle
  const LIGHT_FOLLOW = 3.5;   // how quickly the light catches up with the cursor (higher = snappier)
  const LIGHT_FADE = 2.5;     // how quickly it swells / fades
  const lit = FR ? [...frameLayer.querySelectorAll('.fr-para p')].map(el => ({ el, x: 0, y: 0, r: 0 })) : [];
  if (lit.length) {
    let mx = -1e4, my = -1e4, lightOn = false, lightT = 0;
    const lightStep = now => {
      const dt = Math.min(0.05, (now - lightT) / 1000);
      lightT = now;
      let busy = false;
      for (const s of lit) {
        const b = s.el.getBoundingClientRect();
        const lx = mx - b.left, ly = my - b.top;
        const near = s.el.parentElement.classList.contains('on') &&
                     lx > -40 && ly > -40 && lx < b.width + 40 && ly < b.height + 40;
        if (near && s.r < 1) { s.x = lx; s.y = ly; }   // a fresh light starts right at the cursor
        const f = 1 - Math.exp(-dt * LIGHT_FOLLOW);
        s.x += (lx - s.x) * f;
        s.y += (ly - s.y) * f;
        const tr = near ? LIGHT_R : 0;
        s.r += (tr - s.r) * (1 - Math.exp(-dt * LIGHT_FADE));
        if (Math.abs(tr - s.r) < 0.5) s.r = tr;
        if (s.r !== tr || (s.r > 0 && Math.hypot(lx - s.x, ly - s.y) > 0.5)) busy = true;
        s.el.style.setProperty('--lx', s.x.toFixed(1) + 'px');
        s.el.style.setProperty('--ly', s.y.toFixed(1) + 'px');
        s.el.style.setProperty('--lr', s.r.toFixed(1) + 'px');
      }
      if (busy) requestAnimationFrame(lightStep); else lightOn = false;
    };
    const kickLight = () => { if (!lightOn) { lightOn = true; lightT = performance.now(); requestAnimationFrame(lightStep); } };
    addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; kickLight(); }, { passive: true });
    document.addEventListener('pointerout', e => { if (!e.relatedTarget) { mx = my = -1e4; kickLight(); } });
  }

  const covers = (b, t) => t.c < b.c + b.w && t.c + t.cs > b.c && t.r < b.r + b.h && t.r + t.rs > b.r;
  const jitter = t => { const v = Math.sin(t.seed * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };

  function syncFrame(instant) {
    const ids = FR.frames[frameIdx].open;
    const open = ids.map(id => FR.blocks[id]);
    const now = performance.now();
    const snap = instant || reduceMQ.matches;
    for (const t of tiles) {
      const hide = open.some(b => covers(b, t));
      if (snap) { t.hidden = hide; t.f = hide ? 180 : 0; t.flip = null; continue; }
      if (hide === t.hidden) continue;
      t.hidden = hide;
      // keep turning the way the page scrolls: next face-down (180 + 360k)
      // or face-up (360k) angle in that direction
      const base = hide ? 180 : 0;
      const to = flipDir > 0 ? base + 360 * Math.ceil((t.f - base) / 360)
                             : base + 360 * Math.floor((t.f - base) / 360);
      const row = flipDir > 0 ? t.r : FR.rows - 1 - t.r;
      const delay = (row / FR.rows) * STAGGER_MS + jitter(t) * 120;
      t.flip = { from: t.f, to, t0: now + delay };
    }
    frameLayer.classList.toggle('snap', snap);
    for (const [id, el] of Object.entries(blockEls)) el.classList.toggle('on', ids.includes(id));
    if (snap) frameLayer.offsetWidth;   // apply without transition, then let later steps animate
    kick();
  }

  // ---------- flying images: scrubbed by the scroll ----------
  // From the first frame that lists `fly` images to the end, scrolling is
  // continuous instead of one step per gesture: `pos` is a position in frames
  // (2.5 = halfway through frame 2). Each image owns a stretch of it — it sits
  // at scale 0 in the centre of the flyFrom block, then as you scroll it grows
  // and slides out to the left or right until, far wider than the screen,
  // it's gone past the edge. Scroll back and it comes back in.
  const FLY_SPAN = 1.3;       // frames of scroll for one image's trip, centre → off screen
  const PX_PER_FRAME = 700;   // wheel/trackpad px for one frame of scrubbing
  // speed limit, so a hard flick can't fling you past everything: the scroll
  // may only run SCRUB_LEAD frames ahead of what's on screen (extra wheel input
  // is dropped, not queued) and the page moves at most SCRUB_MAX_SPEED frames a
  // second. Slow scrolling is unaffected; nothing ever stops you.
  const SCRUB_LEAD = 0.3;
  const SCRUB_MAX_SPEED = 1.6;
  const REWIND_SPEED = 9;     // frames per second when About / the name badge rewinds to the start
  let rewinding = false, onSettle = null;
  const FLY_W = 0.3;          // image width at scale 1, × window width
  const FLY_END = 3;          // scale at the end of the trip (so ~90% of the window wide)
  const OUTRO_LEN = 2.4;      // frames of scroll after the last image: grid slides off, Work + Contact rise in
  const outro = document.querySelector('.outro');
  const outroEls = outro ? [...outro.querySelectorAll('[data-outro]')].map(el => {
    const [a, b] = el.dataset.outro.split(' ').map(Number);
    return { el, a, b };
  }) : [];
  const outroVids = outro ? [...outro.querySelectorAll('video')] : [];
  let outroShift = 0;         // px the tile grid has slid up
  let pos = 0, posT = 0;      // shown / target scroll position, in frames (eased toward each other)
  let hold = false;           // after a frame step: ignore the rest of that gesture
  const SCRUB = FR && (() => {
    const from = FR.frames.findIndex(f => f.fly && f.fly.length);
    if (from < 0) return null;
    const flyers = [];
    FR.frames.forEach((f, fi) => (f.fly || []).forEach((src, i, list) => {
      const n = flyers.length;
      const el = document.createElement('img');
      el.className = 'fly';
      el.src = src;
      el.alt = '';
      flyLayer.appendChild(el);
      flyers.push({
        el,
        s0: fi + i / list.length,                         // where along the scroll it starts
        side: n % 2 ? -1 : 1,                             // alternate right / left
        tilt: -12 + ((n * 0.618034) % 1) * 37,            // deg: a little up … a little more down
      });
    }));
    const last = FR.frames.length - 1;
    const end = Math.max(last, ...flyers.map(f => f.s0 + FLY_SPAN));
    return { from, last, end, max: end + (outro ? OUTRO_LEN : 0), flyers };
  })();
  const inScrub = () => SCRUB && frameIdx >= SCRUB.from;

  function renderFly() {
    if (!SCRUB || !blockRects[FR.flyFrom]) return;
    const [bx, by, bw, bh] = blockRects[FR.flyFrom];
    const cx = bx + bw / 2, cy = by + bh / 2;
    const w = geo.w * FLY_W;
    const dist = geo.w / 2 + (w * FLY_END) / 2 + 40;   // centre far enough out that the inner edge clears the screen
    for (const f of SCRUB.flyers) {
      const k = (pos - f.s0) / FLY_SPAN;
      if (k <= 0 || k >= 1) { f.el.style.display = 'none'; continue; }
      const sc = FLY_END * Math.pow(k, 1.3);           // grows from nothing…
      const out = dist * Math.pow(k, 1.8);              // …and drifts out a beat later, speeding up
      const x = f.side * out, y = Math.tan(f.tilt * Math.PI / 180) * out;
      Object.assign(f.el.style, {
        display: 'block', width: w + 'px', left: cx + 'px', top: cy + 'px',
        zIndex: Math.round(k * 100),                    // the bigger (nearer) one on top
        transform: `translate(-50%, -50%) translate(${x}px, ${y}px) perspective(1200px) rotateY(${-f.side * 24 * k}deg) scale(${sc})`,
      });
    }
    renderOutro();
  }

  // the ending: u = frames scrolled past the last image
  const smooth = v => v * v * (3 - 2 * v);
  function renderOutro() {
    if (!outro) return;
    const u = pos - SCRUB.end;
    outroShift = smooth(clamp(u, 0, 1)) * geo.h;   // the first frame of it slides the whole grid off the top
    const tf = outroShift ? `translateY(${-outroShift}px)` : '';
    canvas.style.transform = frameLayer.style.transform = flyLayer.style.transform = tf;
    for (const o of outroEls) o.el.style.setProperty('--p', smooth(clamp((u - o.a) / (o.b - o.a), 0, 1)).toFixed(4));
    const live = u > 0.9;
    if (live !== outro.classList.contains('is-live')) {
      outro.classList.toggle('is-live', live);
      document.body.classList.toggle('outro-live', live);
      for (const v of outroVids) live ? v.play().catch(() => {}) : v.pause();
      if (live) { cursor = null; hovered = null; kick(); }   // tiles are gone: drop their hover tilt
    }
  }
  let flyRunning = false, flyLast = 0;
  function flyFrame(now) {
    const dt = Math.min(0.05, (now - flyLast) / 1000);
    flyLast = now;
    const step = (posT - pos) * (1 - Math.exp(-dt * 12));   // smooth out wheel notches…
    const vmax = rewinding ? REWIND_SPEED : SCRUB_MAX_SPEED;
    pos += clamp(step, -vmax * dt, vmax * dt);   // …up to the top speed
    if (Math.abs(posT - pos) < 1e-4) pos = posT;
    renderFly();
    if (pos !== posT) requestAnimationFrame(flyFrame);
    else {
      flyRunning = false;
      if (onSettle) { const f = onSettle; onSettle = null; f(); }
    }
  }
  function kickFly() {
    if (!flyRunning) { flyRunning = true; flyLast = performance.now(); requestAnimationFrame(flyFrame); }
  }

  if (FR) {
    let lockUntil = 0;
    const go = d => {
      const n = clamp(frameIdx + d, 0, FR.frames.length - 1);
      if (n === frameIdx) return false;
      frameIdx = n; flipDir = d;
      pos = posT = n;
      syncFrame(false);
      renderFly();
      lockUntil = performance.now() + FLIP_MS * 0.8;
      return true;
    };
    // inside the scrub stretch: move by d frames; past its start, step back out
    // (stopping at the start first, so one long gesture doesn't overshoot)
    // free = keyboard jumps (Page Down etc.), which skip the speed limit's lead cap
    const scrubBy = (d, free) => {
      const n = free ? posT + d : clamp(posT + d, pos - SCRUB_LEAD, pos + SCRUB_LEAD);
      if (n < SCRUB.from) {
        if (posT > SCRUB.from) { posT = SCRUB.from; hold = true; kickFly(); }
        else { go(-1); hold = true; }
        return;
      }
      posT = Math.min(n, SCRUB.max);
      const idx = Math.min(Math.floor(posT), SCRUB.last);
      if (idx !== frameIdx) { flipDir = Math.sign(idx - frameIdx); frameIdx = idx; syncFrame(false); }
      kickFly();
    };
    // wheel / trackpad: before the scrub stretch, one frame per gesture. A
    // trackpad keeps sending wheel events through its inertia, so after a step
    // wait for a pause (a new gesture) before doing anything else.
    let acc = 0, lastWheel = 0;
    addEventListener('wheel', e => {
      const now = performance.now();
      if (now - lastWheel > 180) { hold = false; acc = 0; }
      lastWheel = now;
      if (hold) return;
      const dy = e.deltaMode ? e.deltaY * 30 : e.deltaY;
      if (inScrub()) { scrubBy(dy / PX_PER_FRAME); return; }
      if (now < lockUntil) return;
      acc += dy;
      if (Math.abs(acc) < 30) return;
      if (go(Math.sign(acc))) hold = true;
      acc = 0;
    }, { passive: true });

    let touchY = null, touchY0 = null, dragged = false;
    addEventListener('touchstart', e => { touchY = touchY0 = e.touches[0].clientY; dragged = false; hold = false; }, { passive: true });
    addEventListener('touchmove', e => {
      if (touchY == null || hold || !inScrub()) return;
      const y = e.touches[0].clientY;
      scrubBy((touchY - y) * 1.5 / PX_PER_FRAME);
      touchY = y; dragged = true;
    }, { passive: true });
    addEventListener('touchend', e => {
      if (touchY0 == null) return;
      const dy = touchY0 - e.changedTouches[0].clientY;
      touchY = touchY0 = null;
      if (!dragged && Math.abs(dy) > 40 && performance.now() >= lockUntil) go(Math.sign(dy));
    }, { passive: true });

    addEventListener('keydown', e => {
      const onControl = e.target.closest && e.target.closest('a, button, input, textarea, [role="button"]');
      const down = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !onControl);
      const up = e.key === 'ArrowUp' || e.key === 'PageUp';
      if (!down && !up) return;
      e.preventDefault();
      const big = e.key !== 'ArrowDown' && e.key !== 'ArrowUp';
      if (!inScrub()) go(down ? 1 : -1);
      else if (down) scrubBy(big ? Math.floor(posT) + 1 - posT : 0.35, true);
      else scrubBy(big ? -Math.max(posT - Math.ceil(posT - 1), 1e-6) : -0.35, true);
    });

    // About + the name badge link to "/", i.e. this page: instead of reloading,
    // play everything back to the first frame — the ending slides away, the
    // images shrink back into the centre, then the tiles flip to frame 1.
    const toStart = () => {
      rewinding = false;
      if (frameIdx === 0) return;
      flipDir = -1; frameIdx = 0; pos = posT = 0;
      syncFrame(false);
      renderFly();
    };
    const rewind = () => {
      hold = true;   // ignore the rest of any scroll gesture in progress
      if (inScrub() && posT > SCRUB.from) {
        rewinding = true;
        onSettle = toStart;
        scrubBy(SCRUB.from - posT, true);
      } else toStart();
    };
    document.querySelectorAll('a[href="/"]').forEach(a => a.addEventListener('click', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // new tab etc. as usual
      e.preventDefault();
      rewind();
    }));
  }

  // ---------- input: the cursor is the light ----------
  let cursor = null;
  // the light keeps the last place the cursor was — leaving the window (or
  // lifting a finger) resets the tilt and the hover note, but not the shading
  let lightPos = null;
  // each tile has a note (js/tile-sound.js): it sounds when the cursor moves
  // onto a tile, not while it stays there. Nav + portrait card sit above the
  // tiles, so hovering them stays silent.
  let hovered = null;
  function updateHover(e) {
    let hit = null;
    const overUI = e.target && e.target.closest && e.target.closest('.photo, .photo-tabs, .site-nav, .sound-toggle, .outro.is-live');
    if (cursor && !overUI) {
      for (const t of tiles) {
        if (t.hidden) continue;
        if (cursor.x >= t.x0 && cursor.x <= t.x0 + t.w && cursor.y >= t.y0 && cursor.y <= t.y0 + t.h) { hit = t; break; }
      }
    }
    if (hit !== hovered) {
      hovered = hit;
      if (hit && window.tileSound) window.tileSound.hover(hit.seed);
    }
  }
  addEventListener('pointermove', e => {
    cursor = { x: e.clientX - geo.left, y: e.clientY - geo.top + outroShift };   // + the grid's slide during the ending
    lightPos = cursor;
    updateHover(e);
    kick();
  }, { passive: true });
  const clear = () => { cursor = null; hovered = null; kick(); };
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) clear(); });
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') clear(); });
  addEventListener('pointercancel', clear);
  addEventListener('blur', clear);
  addEventListener('resize', layout);

  // ---------- animation ----------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const RAD = Math.PI / 180;

  let running = false, last = 0;
  function kick() {
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const maxT = reduceMQ.matches ? 0 : TILT;
    const omega = 6.6 / Math.max(0.05, SMOOTH / 1000);   // critically damped: no overshoot
    const subs = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / subs;
    let busy = false;

    for (const t of tiles) {
      if (t.flip) {
        const k = clamp((now - t.flip.t0) / FLIP_MS, 0, 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // ease in-out cubic
        t.f = t.flip.from + (t.flip.to - t.flip.from) * e;
        if (k >= 1) { t.f = ((t.flip.to % 360) + 360) % 360; t.flip = null; }
        else busy = true;
      }

      let tx = 0, ty = 0;
      // only the tile under the cursor leans toward it (the demo's behaviour)
      if (cursor && !t.hidden && cursor.x >= t.x0 && cursor.x <= t.x0 + t.w && cursor.y >= t.y0 && cursor.y <= t.y0 + t.h) {
        const nx = clamp((cursor.x - t.x0 - t.w / 2) / (t.w / 2), -1, 1);
        const ny = clamp((cursor.y - t.y0 - t.h / 2) / (t.h / 2), -1, 1);
        const tilt = maxT * t.ks;
        ty = nx * tilt; tx = -ny * tilt;
      }

      // tilt: critically damped spring
      for (let i = 0; i < subs; i++) {
        t.vx += (omega * omega * (tx - t.rx) - 2 * omega * t.vx) * h;
        t.vy += (omega * omega * (ty - t.ry) - 2 * omega * t.vy) * h;
        t.rx += t.vx * h;
        t.ry += t.vy * h;
      }
      const moving = Math.abs(t.rx - tx) > 0.005 || Math.abs(t.ry - ty) > 0.005 ||
                     Math.abs(t.vx) > 0.005 || Math.abs(t.vy) > 0.005;
      if (!moving) { t.rx = tx; t.ry = ty; t.vx = t.vy = 0; } else busy = true;
    }

    draw();

    // the light only changes when the cursor does (each move kicks a frame),
    // so keep looping only while a tile is still settling
    if (busy) requestAnimationFrame(frame);
    else running = false;
  }

  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, geo.w, geo.h);
    gl.uniform1f(U.uPersp, PERSP);
    gl.uniform1f(U.uShadow, SHADOW);
    gl.uniform1f(U.uIri, PEARL.iridescence);
    gl.uniform1f(U.uRipple, PEARL.crinkle);
    gl.uniform1f(U.uGloss, PEARL.gloss);
    gl.uniform1f(U.uLightI, PEARL.lightStrength);

    // flipping tiles draw over still ones
    const lean = t => Math.abs(t.rx) + Math.abs(t.ry) + Math.abs(Math.sin(t.f * RAD)) * 90;
    order.sort((a, b) => lean(a) - lean(b));
    const place = t => {
      gl.uniform2f(U.uCenter, geo.left + t.x0 + t.w / 2, geo.top + t.y0 + t.h / 2);
      gl.uniform2f(U.uSize, t.w, t.h);
      gl.uniform2f(U.uRot, (t.rx + t.f) * RAD, t.ry * RAD);
      gl.uniform1f(U.uRadius, Math.min(t.w, t.h) * PEARL.radius);
    };

    // shadows first, so they fall on the background only
    gl.uniform1i(U.uPass, 0);
    gl.uniform1f(U.uPad, geo.tile * 0.3);
    gl.uniform2f(U.uShift, 0, geo.tile * 0.06);
    for (const t of order) {
      const up = Math.cos(t.f * RAD);
      if (up <= 0) continue;
      place(t);
      gl.uniform1f(U.uShadow, SHADOW * up);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.uniform1i(U.uPass, 1);
    gl.uniform1f(U.uPad, 2);
    gl.uniform2f(U.uShift, 0, 0);
    for (const t of order) {
      const up = Math.cos(t.f * RAD);
      if (up < -0.999) continue;   // lying face down: gone
      place(t);
      // face down = the dark back, fading out as it lies flat
      gl.uniform1i(U.uPass, up >= 0 ? 1 : 2);
      gl.uniform1f(U.uBackA, Math.sqrt(Math.max(0, 1 - up * up)));
      gl.uniform2f(U.uSeed, t.seed, t.seed * 1.618 + 3.7);
      // light = last cursor position in tile-local css px; before the first move it sits up-left of the tile
      const lx = lightPos ? lightPos.x - t.x0 : -t.w * 0.4;
      const ly = lightPos ? lightPos.y - t.y0 : -t.h * 0.6;
      gl.uniform3f(U.uLight, lx, ly, PEARL.lightHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  reduceMQ.addEventListener?.('change', kick);
  layout();
  // the nav's own height shifts slightly once Space Mono finishes loading
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
})();
