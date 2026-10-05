/**
 * tile-sound.js — hover sound for the home page tiles.
 *
 * Adapted from tile-click.js (In sen scale, no bounce, volume 80%, low notes
 * only). The tiles are drawn in a WebGL canvas, not DOM elements, so instead
 * of per-element pointerenter listeners, js/home-scales.js calls
 *   tileSound.hover(i)
 * whenever the cursor moves onto tile i (i = the tile's stable index).
 */
(() => {
  const VOLUME = 0.56;      // 0 to 1 (was 0.8; lowered 30%)
  const NOTE_COUNT = 6;     // how many different pitches to cycle through, lowest first

  function createTileClick(volume) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const out = ctx.createGain();
    out.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    out.connect(comp);
    comp.connect(ctx.destination);

    // 40 ms of noise for the contact click
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // [frequency ratio, level, decay time constant in seconds]
    const PARTIALS = [[1, 1, 0.012], [2.33, 0.25, 0.006]];

    function tone(f, level, tau, t) {
      if (f > 16000) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const end = t + tau * 9;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(end + 0.02);
    }

    return {
      resume() { return ctx.resume(); },
      get running() { return ctx.state === 'running'; },
      setVolume(v) { out.gain.value = v; },
      // freq in Hz, vel 0..1 (how hard the hit is)
      strike(freq, vel = 0.7) {
        const t = ctx.currentTime + 0.005;
        for (const [ratio, level, tau] of PARTIALS) tone(freq * ratio, level * vel * 0.3, tau, t);
        const src = ctx.createBufferSource();
        const hp = ctx.createBiquadFilter();
        const ng = ctx.createGain();
        src.buffer = noise;
        hp.type = 'highpass';
        hp.frequency.value = 2500;
        ng.gain.setValueAtTime(vel * 0.12, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.004);
        src.connect(hp);
        hp.connect(ng);
        ng.connect(out);
        src.start(t);
      }
    };
  }

  // Browsers only allow sound after the visitor clicks, taps or presses a key
  // once, so the audio context is created on that first gesture (creating it
  // earlier just earns a console warning) — hovering is silent until then.
  let click = null;
  const unlock = () => {
    if (!click) click = createTileClick(VOLUME);
    click.resume();
  };
  ['pointerdown', 'keydown'].forEach(type =>
    addEventListener(type, unlock, { once: true })
  );

  // In sen scale, in semitones above the base note (A5, 880 Hz)
  const SCALE = [0, 1, 5, 7, 10];
  const freqOf = i => 880 * 2 ** ((Math.floor(i / SCALE.length) * 12 + SCALE[i % SCALE.length]) / 12);

  // ---- mute (the speaker button, bottom-left; choice is remembered) ----
  let muted = false;
  try { muted = localStorage.getItem('tileSound:muted') === '1'; } catch (e) { /* storage blocked — default unmuted */ }

  const btn = document.querySelector('.sound-toggle');
  function syncButton() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(muted));
    btn.setAttribute('aria-label', muted ? 'Unmute tile sounds' : 'Mute tile sounds');
    btn.querySelector('.sound-toggle__on').hidden = muted;
    btn.querySelector('.sound-toggle__off').hidden = !muted;
  }
  if (btn) {
    btn.addEventListener('click', () => {
      muted = !muted;
      try { localStorage.setItem('tileSound:muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      syncButton();
    });
    syncButton();
  }

  window.tileSound = {
    hover(i) {
      if (!muted && click && click.running) click.strike(freqOf(i % NOTE_COUNT));
    }
  };
})();
