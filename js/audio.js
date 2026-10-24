// Tiny WebAudio synth. Everything goes through `master`, which can also feed the video recorder.
let ctx = null, master = null, dest = null, noiseBuf = null, engine = null, beatTimer = null;

export function initAudio(){
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = .8; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
export function audioStream(){ initAudio(); if (!dest){ dest = ctx.createMediaStreamDestination(); master.connect(dest); } return dest.stream; }
const now = () => ctx.currentTime;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
function env(g, t, a, peak, dec){ g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + dec); }
function osc(type, f, t, dur, peak, a = .005, f2 = null, out = master){ const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); env(g, t, a, peak, dur); o.connect(g).connect(out); o.start(t); o.stop(t + a + dur + .05); return o; }
function noise(t, dur, peak, type = 'bandpass', f = 2000, q = 1, f2 = null, a = .005){ const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q; env(g, t, a, peak, dur); s.connect(fl).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + a + dur + .05); }

const on = () => ctx && ctx.state === 'running';
let lastSqueak = 0;
export function squeak(){ if (!on() || now() - lastSqueak < .045) return; lastSqueak = now(); noise(now(), .06, .09, 'bandpass', 1800 + Math.random() * 3400, 6); }
export function crash(i = .6){ if (!on()) return; const t = now(); osc('sine', 130, t, .25, .5 * i + .2, .002, 40); noise(t, .18, .35 * i + .1, 'lowpass', 900, .7); }
export function fall(){ if (!on()) return; osc('sine', 1500, now(), 1.1, .18, .02, 280); }
export function shot(){ if (!on()) return; const t = now(); osc('sine', 160, t, .12, .35, .002, 60); osc('sawtooth', 1800, t, .22, .06, .002, 600); noise(t, .1, .15, 'highpass', 3000, .7); }
export function whoosh(){ if (!on()) return; noise(now(), .35, .2, 'bandpass', 500, 2, 3500, .12); }
export function pop(){ if (!on()) return; osc('sine', 700, now(), .08, .2, .002, 1200); }
export function sad(){ if (!on()) return; const t = now(); [311, 294, 277].forEach((f, i) => tromb(f, t + i * .42, .38)); tromb(262, t + 1.26, 1.0, true); }
function tromb(f, t, dur, vib){ const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); if (vib){ const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = 7; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + .1); }
  fl.type = 'lowpass'; fl.frequency.value = 900; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.13, t + .04); g.gain.setValueAtTime(.13, t + dur - .08); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + dur + .05); }
export function win(){ if (!on()) return; const t = now(); [72, 76, 79, 84, 88].forEach((n, i) => { osc('sine', midi(n), t + i * .09, .5, .25); osc('triangle', midi(n + 12), t + i * .09, .18, .06); }); noise(t + .2, 1.6, .12, 'bandpass', 1400, .6, 2200, .4); }
export function engineOn(){ if (!on() || engine) return; const t = now(), g = ctx.createGain(), fl = ctx.createBiquadFilter(), a = ctx.createOscillator(), b = ctx.createOscillator(); a.type = 'square'; b.type = 'sine'; a.frequency.value = 70; b.frequency.value = 35; fl.type = 'lowpass'; fl.frequency.value = 380;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .2); a.connect(fl); b.connect(fl); fl.connect(g).connect(master); a.start(t); b.start(t); engine = { a, b, g }; }
export function engineRev(v){ if (!engine) return; const f = 70 + Math.min(1, Math.abs(v) / 10) * 30; engine.a.frequency.setTargetAtTime(f, now(), .1); engine.b.frequency.setTargetAtTime(f / 2, now(), .1); }
export function engineOff(){ if (!engine) return; const t = now(), e = engine; engine = null; e.g.gain.setTargetAtTime(0, t, .08); e.a.stop(t + .5); e.b.stop(t + .5); }
// a light background beat for the exported video
export function beat(play){ if (!ctx) return; if (!play){ clearInterval(beatTimer); beatTimer = null; return; } if (beatTimer) return;
  const spb = 60 / 112 / 2; let next = now() + .1, k = 0; const bass = [43, 43, 40, 41];
  beatTimer = setInterval(() => { while (next < now() + .2){ const s = k % 16, t = next;
      if (s % 4 === 0) osc('sine', 120, t, .22, .4, .002, 45);
      if (s % 8 === 4) noise(t, .12, .12, 'bandpass', 1500, .8);
      if (s % 2 === 1) noise(t, .03, .04, 'highpass', 7000, .7);
      if (s % 4 === 2) osc('triangle', midi(bass[Math.floor(k / 16) % 4]), t, .2, .12);
      next += spb; k++; } }, 50); }
