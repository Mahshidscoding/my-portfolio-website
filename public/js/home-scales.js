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
  const NAV_MIN = 300;   // narrowest the nav info box can be (px) before its tabs crowd
  function fitGrid(W, H) {
    const aw = W - 2 * MARGIN, ah = H - 2 * MARGIN;
    const R = Math.max(3, Math.min(8, Math.round((ah + GAP) / (TARGET + GAP))));
    const th = (ah - (R - 1) * GAP) / R;
    const C = Math.max(3, Math.round((aw + GAP) / (th + GAP)));
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

uniform int uPass;          // 0 = drop shadow, 1 = tile
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
    document.getElementById('stage').remove();
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
                   'uSeed', 'uLight', 'uIri', 'uRipple', 'uGloss', 'uRadius', 'uLightI']) {
    U[n] = gl.getUniformLocation(prog, n);
  }

  // ---------- tiles ----------
  let seedN = 0;
  const makeTile = (x, y, w, h) => ({
    x0: x, y0: y, w, h,
    seed: seedN++,               // stable per tile: its own colour + crinkle
    ks: Math.min(1, geo.tile / Math.max(w, h)),   // long tiles lean less
    rx: 0, ry: 0, vx: 0, vy: 0,  // tilt + velocity (deg)
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
  // photo card opens across the 2 × 2 block ending at its own cell
  let photoCell = null, photoOpen = false;
  function placePhoto() { place(photo, ...(photoOpen ? photoCell.four : photoCell.one)); }
  function setPhoto(open) {
    if (open === photoOpen) return;
    photoOpen = open;
    photo.classList.toggle('open', open);
    photo.setAttribute('aria-expanded', open);
    placePhoto();
  }
  photo.addEventListener('click', e => { if (!e.target.closest('a')) setPhoto(!photoOpen); });
  photo.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === photo) { e.preventDefault(); setPhoto(!photoOpen); }
  });
  document.addEventListener('click', e => { if (!photo.contains(e.target)) setPhoto(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setPhoto(false); });

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

    photoCell = { one: [x + (C - 1) * sx, y + (R - 1) * sy, w, h],
                  four: [x + (C - 2) * sx, y + (R - 2) * sy, 2 * w + GAP, 2 * h + GAP] };
    placePhoto();

    seedN = 0;
    const next = [];
    if (logoShown && h - nameH - GAP >= 24) next.push(makeTile(0, nameH + GAP, nameW, h - nameH - GAP));  // under the name badge
    if (h - infoH - GAP >= 24) next.push(makeTile((C - cols) * sx, infoH + GAP, infoW, h - infoH - GAP)); // under the nav
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (r === 0 && (c < nameCols || c >= C - cols)) continue;
        if (r === R - 1 && c === C - 1) continue;
        next.push(makeTile(c * sx, r * sy, w, h));
      }
    }
    tiles = next; order = tiles.slice();
    hovered = null;
    kick();
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
    const overUI = e.target && e.target.closest && e.target.closest('.photo, .site-nav, .sound-toggle');
    if (cursor && !overUI) {
      for (const t of tiles) {
        if (cursor.x >= t.x0 && cursor.x <= t.x0 + t.w && cursor.y >= t.y0 && cursor.y <= t.y0 + t.h) { hit = t; break; }
      }
    }
    if (hit !== hovered) {
      hovered = hit;
      if (hit && window.tileSound) window.tileSound.hover(hit.seed);
    }
  }
  addEventListener('pointermove', e => {
    cursor = { x: e.clientX - geo.left, y: e.clientY - geo.top };
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
      let tx = 0, ty = 0;
      // only the tile under the cursor leans toward it (the demo's behaviour)
      if (cursor && cursor.x >= t.x0 && cursor.x <= t.x0 + t.w && cursor.y >= t.y0 && cursor.y <= t.y0 + t.h) {
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

    order.sort((a, b) => (Math.abs(a.rx) + Math.abs(a.ry)) - (Math.abs(b.rx) + Math.abs(b.ry)));
    const place = t => {
      gl.uniform2f(U.uCenter, geo.left + t.x0 + t.w / 2, geo.top + t.y0 + t.h / 2);
      gl.uniform2f(U.uSize, t.w, t.h);
      gl.uniform2f(U.uRot, t.rx * RAD, t.ry * RAD);
      gl.uniform1f(U.uRadius, Math.min(t.w, t.h) * PEARL.radius);
    };

    // shadows first, so they fall on the background only
    gl.uniform1i(U.uPass, 0);
    gl.uniform1f(U.uPad, geo.tile * 0.3);
    gl.uniform2f(U.uShift, 0, geo.tile * 0.06);
    for (const t of order) { place(t); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

    gl.uniform1i(U.uPass, 1);
    gl.uniform1f(U.uPad, 2);
    gl.uniform2f(U.uShift, 0, 0);
    for (const t of order) {
      place(t);
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
