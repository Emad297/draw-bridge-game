// Sound: real recorded impacts/explosions (Kenney, CC0 — see sfx/) layered with synthesized engine, tyres, fire and wind.
// Everything runs through one graph per AudioContext, so the same code also renders offline into the exported video.
const NAMES = { metalH: 5, metalM: 5, metalL: 5, rock: 5, ink: 5, thud: 5, plate: 5, pebble: 5, glass: 5, boom: 5, boomLow: 2 };
const bufs = {}; let live = null, G = null, offT = null, loading = null;

function graph(ctx){
  const out = ctx.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 5; out.attack.value = .004; out.release.value = .25; out.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = .7; master.connect(out);
  // a short outdoor-ish reverb made from decaying noise
  const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++){ const d = ir.getChannelData(c); for (let i = 0; i < len; i++){ const u = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - u, 3.2) * (i < ctx.sampleRate * .012 ? 0 : 1); } }
  const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = .32; verb.connect(wet).connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = noise.getChannelData(0); let b = 0; for (let i = 0; i < nd.length; i++){ const w = Math.random() * 2 - 1; b = (b + .02 * w) / 1.02; nd[i] = w * .5 + b * 3; }
  const g = { ctx, master, verb, noise, out };
  // continuous layers
  const loop = (filterType, f, q) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; fl.Q.value = q; const gn = ctx.createGain(); gn.gain.value = 0; s.connect(fl).connect(gn).connect(master); s.start(); return { fl, gn }; };
  g.wind = loop('lowpass', 380, .4); g.wind.gn.gain.value = .05;
  g.tire = loop('bandpass', 420, .8); g.fireL = loop('lowpass', 900, .5); g.saw = null;
  // engine: two detuned saws through a soft clipper and a low-pass, with a "putt" tremolo
  const e1 = ctx.createOscillator(), e2 = ctx.createOscillator(); e1.type = e2.type = 'sawtooth'; const sh = ctx.createWaveShaper(), curve = new Float32Array(256); for (let i = 0; i < 256; i++){ const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.5); } sh.curve = curve;
  const elp = ctx.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 420; elp.Q.value = 2; const trem = ctx.createGain(), lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfoG.gain.value = .35; lfo.connect(lfoG).connect(trem.gain); trem.gain.value = .65;
  const eg = ctx.createGain(); eg.gain.value = 0; e1.connect(sh); e2.connect(sh); sh.connect(elp).connect(trem).connect(eg).connect(master); [e1, e2, lfo].forEach(o => o.start());
  g.eng = { e1, e2, lfo, elp, eg };
  return g;
}
export function initAudio(){
  if (!live){ const AC = window.AudioContext || window.webkitAudioContext; live = new AC(); G = graph(live); loadSounds(); }
  if (live.state === 'suspended') live.resume(); return live;
}
function loadSounds(){ if (loading) return loading; const base = new URL('../sfx/', import.meta.url);
  loading = Promise.all(Object.entries(NAMES).flatMap(([n, k]) => Array.from({ length: k }, (_, i) => fetch(new URL(`${n}${i}.mp3`, base)).then(r => r.arrayBuffer()).then(a => live.decodeAudioData(a)).then(b => { (bufs[n] ||= [])[i] = b; }).catch(() => {}))));
  return loading; }
export function audioStream(){ initAudio(); if (!G.dest){ G.dest = live.createMediaStreamDestination(); G.out.connect(G.dest); } return G.dest.stream; }
const now = () => offT ?? G.ctx.currentTime;
const on = () => G && (offT != null || G.ctx.state === 'running');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// play one recorded sample
function play(name, gain = 1, rate = 1, pan = 0, delay = 0, verb = .4){ const list = (bufs[name] || []).filter(Boolean); if (!list.length || !on()) return;
  const c = G.ctx, s = c.createBufferSource(); s.buffer = list[Math.floor(Math.random() * list.length)]; s.playbackRate.value = rate * (.92 + Math.random() * .16);
  const g = c.createGain(); g.gain.value = gain; const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); s.connect(g).connect(p); p.connect(G.master); if (verb){ const v = c.createGain(); v.gain.value = verb; p.connect(v).connect(G.verb); } s.start(now() + delay); }
function noiseHit(dur, gain, type, f, q = 1, f2 = null, pan = 0, delay = 0){ if (!on()) return; const c = G.ctx, t = now() + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), p = c.createStereoPanner();
  s.buffer = G.noise; fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q; p.pan.value = clamp(pan, -1, 1);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur); s.connect(fl).connect(g).connect(p).connect(G.master); const v = c.createGain(); v.gain.value = .5; p.connect(v).connect(G.verb); s.start(t, Math.random()); s.stop(t + dur + .05); }
function sub(f0, f1, dur, gain, delay = 0){ if (!on()) return; const c = G.ctx, t = now() + delay, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(G.master); o.start(t); o.stop(t + dur + .05); }

// ---- events
export function hit(a, b, v, pan){ const m = [a, b], has = k => m.includes(k), k = clamp(v / 9, .05, 1);
  if (has('glass')) play('glass', .15 + k * .5, 1.2, pan, 0, .3);
  else if (has('metal')) play(v > 6 ? 'metalH' : v > 3 ? 'metalM' : 'metalL', .25 + k * .6, 1, pan);
  else if (has('rock')) play(v > 4 ? 'rock' : 'pebble', .15 + k * .5, v > 4 ? 1 : 1.25, pan, 0, .25);
  else if (has('ink')) play('ink', .2 + k * .55, 1.1, pan);
  else if (has('tire')){ if (v > 2.2) play('thud', .15 + k * .5, .8, pan, 0, .2); }
  else play('thud', .2 + k * .5, .7, pan); }
export function boom(pan){ if (!on()) return; play('boom', 1, .85, pan, 0, .9); play('boomLow', 1, 1, pan * .5, 0, .6); sub(70, 28, 1.6, .9); noiseHit(2.2, .5, 'lowpass', 3200, .7, 140, pan);
  for (let i = 0; i < 7; i++) play(i % 2 ? 'pebble' : 'metalL', .25, .9 + Math.random() * .4, pan + (Math.random() - .5) * .6, .35 + Math.random() * 1.2, .3); }
export function crumble(k, pan){ play('rock', .5 + k * .5, .8, pan, 0, .5); sub(90, 40, .4, .35 * k + .1); noiseHit(.6, .25 * k + .05, 'lowpass', 900, .7, 200, pan); for (let i = 0; i < 4; i++) play('pebble', .2, 1.2, pan, .1 + Math.random() * .6, .2); }
export function snap(pan, mat){
  if (mat === 'steel'){ play('metalH', .9, 1.25, pan); play('plate', .5, .7, pan, .02); return; }
  if (mat === 'rope'){ play('thud', .5, 1.4, pan); noiseHit(.08, .35, 'bandpass', 1800, 2, null, pan); return; }
  if (mat === 'rubber'){ play('thud', .6, 1.1, pan); return; }
  play('ink', .9, mat === 'wood' ? .75 : 1.6, pan); noiseHit(.05, .45, 'highpass', 2500, .7, null, pan); if (mat === 'wood') noiseHit(.25, .2, 'bandpass', 1200, 1.5, 400, pan, .02); }
export function shatter(pan, mat){ play('glass', 1, mat === 'ice' ? .8 : 1.05, pan, 0, .6); play('glass', .6, 1.3, pan, .06, .5); noiseHit(.3, .25, 'highpass', 5000, .7, null, pan); }
export function partoff(pan){ play('metalH', .8, .8, pan); play('glass', .45, 1, pan, .03); }
export function dent(k, pan){ play('metalH', .4 + k * .6, .85, pan); }
export function spark(pan){ play('metalL', .25, 1.7, pan, 0, .2); }
export function shot(pan){ play('thud', .55, .55, pan); play('metalM', .3, .65, pan, .02); noiseHit(.25, .15, 'bandpass', 900, 1.2, 3000, pan); }
export function fall(){ noiseHit(1.4, .18, 'bandpass', 300, 1.5, 1600, 0); }
export function win(){ if (!on()) return; for (let i = 0; i < 6; i++) noiseHit(1.6 + Math.random(), .08, 'bandpass', 900 + Math.random() * 1600, .8, null, (Math.random() - .5) * 1.4, Math.random() * .4); for (let i = 0; i < 14; i++) noiseHit(.04, .12, 'bandpass', 1600, 1.5, null, (Math.random() - .5), .2 + Math.random() * 1.6); }
export function whoosh(){ noiseHit(.35, .15, 'bandpass', 500, 2, 3500); }
export function pop(){ play('plate', .25, 1.6, 0, 0, .1); }
let lastSqueak = -1;
export function squeak(){ if (!on() || now() - lastSqueak < .05) return; lastSqueak = now(); noiseHit(.07, .05, 'bandpass', 2200 + Math.random() * 2600, 5); }
let crackleT = 0;
// per-frame state of the continuous layers: engine, tyres, fire
export function drive(d){ if (!G) return; const t = now(), e = G.eng, k = .08;
  const running = d && d.on, rpm = running ? d.rpm : 0, f = 34 + Math.min(12, rpm) * 4.2;
  e.e1.frequency.setTargetAtTime(f, t, k); e.e2.frequency.setTargetAtTime(f * 1.012, t, k); e.lfo.frequency.setTargetAtTime(f / 2, t, k); e.elp.frequency.setTargetAtTime(260 + rpm * 55, t, k);
  e.eg.gain.setTargetAtTime(running ? .07 + Math.min(1, rpm / 9) * .06 : 0, t, .12);
  const roll = d ? Math.min(1, d.roll / 9) : 0; G.tire.gn.gain.setTargetAtTime(roll * .22, t, .06); G.tire.fl.frequency.setTargetAtTime(250 + roll * 500, t, .1);
  const fire = d ? d.fire : 0; G.fireL.gn.gain.setTargetAtTime(fire * .16, t, .2);
  if (fire > 0 && on()){ crackleT += d.dt || 1 / 60; while (crackleT > 0){ crackleT -= 1 / (4 + fire * 18); noiseHit(.02 + Math.random() * .03, (.08 + Math.random() * .2) * fire, 'highpass', 1500 + Math.random() * 3000, .7, null, d.pan || 0, Math.random() * .05); } }
  if (roll > .25 && on() && Math.random() < roll * .12) play('pebble', .06 * roll, 1.4, d.pan || 0, 0, 0); }

// ---- offline rendering for the video export: sounds are scheduled into an OfflineAudioContext on a virtual clock
export function offline(octx){ initAudio(); const saved = G; G = graph(octx); offT = 0; lastSqueak = -1;
  return { at(t){ offT = t; }, done(){ G = saved; offT = null; } }; }
export const ready = () => loading;
