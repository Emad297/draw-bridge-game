// Sound: real recordings — car crashes, metal crunches, glass, tyres, engine, explosions (see sfx/LICENSE-*.txt) —
// mixed through one graph per AudioContext, so the same code also renders offline into the exported video.
// Every event picks a random variant at a slightly random pitch, so repeated hits never sound copy-pasted.
const NAMES = { metalH: 5, metalM: 5, metalL: 5, rock: 5, thud: 5, plate: 5, pebble: 5, glass: 5, boom: 5, boomLow: 2,
  crash: 4, crunch: 4, clang: 4, shatter: 3, bump: 3, explode: 2, debris: 4, grind: 1, pop: 1, slam: 1, scrape: 1, screech: 1, engine: 2, fire: 1 };
const LOOPS = ['engine', 'screech', 'scrape', 'fire'];
const bufs = {}; let live = null, G = null, offT = null, loading = null;

function graph(ctx){
  const out = ctx.createDynamicsCompressor(); out.threshold.value = -12; out.ratio.value = 6; out.attack.value = .003; out.release.value = .25; out.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = .75; master.connect(out);
  // a short, boxy room reverb: the backrooms are an empty office
  const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++){ const d = ir.getChannelData(c); for (let i = 0; i < len; i++){ const u = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - u, 4) * (i < ctx.sampleRate * .008 ? 0 : 1); } }
  const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = .3; verb.connect(wet).connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = noise.getChannelData(0); let b = 0; for (let i = 0; i < nd.length; i++){ const w = Math.random() * 2 - 1; b = (b + .02 * w) / 1.02; nd[i] = w * .5 + b * 3; }
  const g = { ctx, master, verb, noise, out, loops: {} };
  // fluorescent hum of the backrooms
  const hum = ctx.createGain(); hum.gain.value = 0; hum.connect(master); g.hum = hum;
  for (const [f, a] of [[120, .5], [240, .25], [360, .12], [1080, .03]]){ const o = ctx.createOscillator(), og = ctx.createGain(); o.type = f > 500 ? 'square' : 'sine'; o.frequency.value = f; og.gain.value = a; o.connect(og).connect(hum); o.start(); }
  return g;
}
export function initAudio(){
  if (!live){ const AC = window.AudioContext || window.webkitAudioContext; live = new AC(); G = graph(live); loadSounds(); }
  if (live.state === 'suspended') live.resume(); return live;
}
function loadSounds(){ if (loading) return loading; const base = new URL('../sfx/', import.meta.url);
  loading = Promise.all(Object.entries(NAMES).flatMap(([n, k]) => Array.from({ length: k }, (_, i) => fetch(new URL(`${n}${i}.mp3`, base)).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(a => live.decodeAudioData(a)).then(b => { (bufs[n] ||= [])[i] = b; }).catch(() => {}))));
  return loading; }
export function audioStream(){ initAudio(); if (!G.dest){ G.dest = live.createMediaStreamDestination(); G.out.connect(G.dest); } return G.dest.stream; }
const now = () => offT ?? G.ctx.currentTime;
const on = () => G && (offT != null || G.ctx.state === 'running');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const has = n => (bufs[n] || []).some(Boolean);
// the first name that has recordings loaded (new car recordings first, the Kenney impact pack as a fallback)
const pick = (...ns) => ns.find(has);

// play one recorded sample
function play(name, gain = 1, rate = 1, pan = 0, delay = 0, verb = .35){ const list = (bufs[name] || []).filter(Boolean); if (!list.length || !on()) return;
  const c = G.ctx, s = c.createBufferSource(); s.buffer = list[Math.floor(Math.random() * list.length)]; s.playbackRate.value = rate * (.9 + Math.random() * .2);
  const g = c.createGain(); g.gain.value = gain; const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); s.connect(g).connect(p); p.connect(G.master); if (verb){ const v = c.createGain(); v.gain.value = verb; p.connect(v).connect(G.verb); } s.start(now() + delay); }
const any = (names, ...a) => { const n = pick(...names); if (n) play(n, ...a); };
function sub(f0, f1, dur, gain, delay = 0){ if (!on()) return; const c = G.ctx, t = now() + delay, o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(G.master); o.start(t); o.stop(t + dur + .05); }

// ---- events
export function hit(a, b, v, pan){ const m = [a, b], is = k => m.includes(k), k = clamp(v / 9, .05, 1);
  if (is('glass')) any(['debris', 'glass'], .15 + k * .4, 1.3, pan, 0, .2);
  else if (is('metal') && (is('stone') || is('rock'))) any(v > 5 ? ['crunch', 'metalH'] : ['clang', 'metalM'], .2 + k * .7, 1, pan);
  else if (is('metal')) any(v > 6 ? ['crash', 'metalH'] : v > 3 ? ['clang', 'metalM'] : ['debris', 'metalL'], .2 + k * .6, 1, pan);
  else if (is('tire')){ if (v > 2) any(['bump', 'thud'], .2 + k * .6, 1, pan, 0, .2); }
  else if (is('plate')) play('plate', .2 + k * .5, 1, pan);
  else if (is('rock')) play(v > 4 ? 'rock' : 'pebble', .15 + k * .5, v > 4 ? 1 : 1.25, pan, 0, .25);
  else play('thud', .2 + k * .5, .7, pan); }
export function boom(pan, k = 1){ if (!on()) return; any(['explode', 'boom'], 1, .95, pan, 0, .8); play('boomLow', .9 * k, 1, pan * .5, 0, .6); sub(70, 26, 1.8, .9 * k);
  for (let i = 0; i < 8; i++) any(['debris', 'metalL'], .3, .9 + Math.random() * .4, pan + (Math.random() - .5) * .6, .3 + Math.random() * 1.4, .3); }
export function crumble(k, pan){ play('rock', .5 + k * .5, .8, pan, 0, .5); sub(90, 40, .4, .35 * k + .1); for (let i = 0; i < 4; i++) play('pebble', .2, 1.2, pan, .1 + Math.random() * .6, .2); }
export const slam = pan => { any(['slam', 'metalL'], 1, 1, pan, 0, .5); sub(80, 35, .35, .6); };
export const cut = pan => { any(['grind', 'metalH'], .8, 1, pan, 0, .2); };
export const tear = pan => { any(['crunch', 'metalH'], .9, .9, pan); };
export const snap = pan => { any(['clang', 'metalM'], .5, 1.3, pan); };
export const partoff = pan => { any(['clang', 'metalH'], .8, .8, pan); };
export const shred = pan => { any(['crunch', 'metalH'], .8, 1.1, pan); for (let i = 0; i < 3; i++) any(['debris', 'metalL'], .3, 1, pan, .1 + Math.random() * .4); };
export const glass = pan => { any(['shatter', 'glass'], .9, 1, pan, 0, .3); };
export const crush = pan => { any(['crash', 'metalH'], 1, .8, pan, 0, .4); any(['crunch'], .8, .7, pan, .05); sub(90, 40, .3, .5); };
export const dent = (k, pan) => { any(k > .5 ? ['crash', 'metalH'] : ['crunch', 'metalM'], .3 + k * .6, 1, pan); };
export const pop = pan => { any(['pop', 'thud'], 1, 1, pan, 0, .3); };
export const click = pan => { play('metalH', .5, 2.2, pan, 0, .1); };
export const creak = pan => { play('plate', .35, .6, pan, 0, .2); play('pebble', .2, .8, pan, .05, .2); };
export const hop = () => { any(['bump', 'thud'], .7, .8, 0, 0, .2); };
export const engineDie = () => { any(['crunch', 'metalL'], .8, .6, 0); sub(60, 25, .8, .4); };
export const leak = pan => { any(['debris', 'pebble'], .3, .7, pan); };
export function win(){ any(['bump'], .5, 1.2, 0); }
export const ready = () => loading;

// ---- continuous layers: engine (recorded loop pitched by revs), tyre screech, metal scraping on the floor, fire, the hum
function loop(name, i = 0){ const c = G.ctx, key = name + i; if (G.loops[key]) return G.loops[key]; const buf = (bufs[name] || [])[i]; if (!buf) return null;
  const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const g = c.createGain(); g.gain.value = 0; s.connect(g).connect(G.master); s.start(); return G.loops[key] = { s, g }; }
export function ambience(onoff){ if (!G) return; G.hum.gain.setTargetAtTime(onoff ? .02 : 0, now(), .1); }
export function drive(d){ if (!G || !on()) return; const t = now(), set = (name, gain, rate, i) => { const l = loop(name, i); if (!l) return; l.g.gain.setTargetAtTime(gain, t, .06); if (rate) l.s.playbackRate.setTargetAtTime(rate, t, .06); };
  const running = d && d.on, rev = running ? clamp(d.rpm / 17, 0, 1.3) : 0;
  // engine0 = driving under load, engine1 = idling: crossfade with the throttle, pitch with the revs
  set('engine', running ? (d.gas ? .32 : .08) * (.6 + Math.min(1, rev) * .4) : 0, .75 + rev * .7, 0); set('engine', running ? (d.gas ? .05 : .3) : 0, .9 + rev * .5, 1);
  const slip = d && d.grounded && running && d.gas ? clamp((d.rpm * .36 - d.speed) / 4, 0, 1) : 0; set('screech', slip * .45);
  set('scrape', d ? clamp((d.scrape || 0) / 6, 0, 1) * .5 : 0, .8 + (d ? clamp((d.scrape || 0) / 10, 0, .6) : 0));
  set('fire', d ? d.fire * .35 : 0); }

// ---- offline rendering for the video export: sounds are scheduled into an OfflineAudioContext on a virtual clock
export function offline(octx){ initAudio(); const saved = G; G = graph(octx); offT = 0;
  return { at(t){ offT = t; }, done(){ G = saved; offT = null; } }; }
