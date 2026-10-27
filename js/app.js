import { LEVEL } from './level.js?v=20261027024443';
import { createSim, DT, KEY } from './physics.js?v=20261027024443';
import { View } from './scene.js?v=20261027024443';
import * as S from './audio.js?v=20261027024443';
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs?v=20261027024443';

const $ = s => document.querySelector(s), show = (el, v = true) => el.classList.toggle('hidden', !v);
const store = { get(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
let likes = store.get('br-likes', []), best = store.get('br-best', 0);
const saveLikes = () => { if (!store.set('br-likes', likes)){ likes.forEach((l, i) => { if (i < likes.length - 6) l.thumb = ''; }); store.set('br-likes', likes); } updateLikeCount(); };

const view = new View($('#game'), LEVEL); view.safe = [.08, .12];
const fit = () => view.size(innerWidth, innerHeight); addEventListener('resize', fit); fit();

let mode = 'menu', sim = null, st = null, acc = 0, clock = 0, shake = 0, lastResult = null, likedThis = null, rec = [], pending = [];

// ---------------- controls: hold ◀ ▶ to walk, tap ⤒ to jump (keyboard: arrows / A D, W or space)
const held = { left: 0, right: 0, jump: 0 }, keys = { left: 0, right: 0, jump: 0 };
const input = () => (held.left || keys.left ? KEY.left : 0) | (held.right || keys.right ? KEY.right : 0) | (held.jump || keys.jump ? KEY.jump : 0);
for (const k of ['left', 'right', 'jump']){ const b = $('#' + k), on = v => e => { e.preventDefault(); held[k] = v; b.classList.toggle('on', !!v); if (v){ S.initAudio(); if (e.pointerId != null) b.setPointerCapture?.(e.pointerId); } };
  b.addEventListener('pointerdown', on(1)); for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, on(0)); b.addEventListener('contextmenu', e => e.preventDefault()); }
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump' };
addEventListener('keydown', e => { const k = KEYMAP[e.code]; if (k){ keys[k] = 1; e.preventDefault(); S.initAudio(); if (mode === 'menu') play(); } if (e.code === 'KeyR' && (mode === 'play' || mode === 'result')) play(); });
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = 0; });

// ---------------- menu
function updateLikeCount(){ $('#likedBtn').textContent = `👍 ${likes.length}`; $('#likedBtn').disabled = !likes.length; }
function toMenu(){ mode = 'menu'; sim = null; st = null; [$('#hud'), $('#pad'), $('#result'), $('#liked')].forEach(e => show(e, false)); show($('#menu')); updateLikeCount(); $('#best').textContent = best ? `best: ${best} m` : ''; view.reset(); }
$('#play').onclick = () => play();

// ---------------- a run
function play(){ S.initAudio(); mode = 'play'; sim = createSim(LEVEL); st = sim.state(); acc = 0; shake = 0; lastResult = null; likedThis = null; rec = []; pending = []; view.reset();
  show($('#menu'), false); show($('#result'), false); show($('#liked'), false); show($('#hud')); show($('#pad')); }
$('#back').onclick = toMenu;
$('#retry').onclick = () => play();
// one place that turns physics events into sound and camera shake (used by the game and by the video export)
function react(e, camX){ const [k, a, b, c] = e, pan = x => Math.max(-1, Math.min(1, (x - camX) / 8));
  if (k === 'hit') S.hit(a, b, c, pan(e[4]));
  if (k === 'boom'){ S.boom(pan(a), c); return .35 + c * .35; }
  if (k === 'crumble') S.crumble(c, pan(a));
  if (k === 'slam'){ S.slam(pan(a)); return .1; }
  if (k === 'cut'){ S.cut(pan(a)); return .04; }
  if (k === 'split'){ S.tear(pan(a)); return .05; }
  if (k === 'snap') S.snap(pan(a));
  if (k === 'partoff') S.partoff(pan(a));
  if (k === 'shred') S.shred(pan(a));
  if (k === 'cardboard') S.cardboard(pan(a));
  if (k === 'glass') S.glass(pan(a));
  if (k === 'crush'){ S.crush(pan(a)); return .2; }
  if (k === 'dent'){ S.dent(a, pan(b)); return a * .08; }
  if (k === 'pop') S.pop(pan(a));
  if (k === 'impale') S.dent(.6, pan(a));
  if (k === 'click') S.click(pan(a));
  if (k === 'creak') S.creak(pan(a));
  if (k === 'hop') S.hop();
  if (k === 'engine') S.engineDie();
  if (k === 'leak') S.leak(pan(a));
  if (k === 'drywall'){ S.drywall(Math.min(1, c / 6), pan(a)); return .04; }
  if (k === 'smash'){ S.crush(pan(a)); return .3; }
  if (k === 'flameOn') S.flameOn(pan(a));
  if (k === 'rumble'){ S.rumble(pan(a)); return .15; }
  if (k === 'crack') S.crumble(.6, pan(a));
  if (k === 'win') S.win();
  return 0; }
// the car's continuous sounds (engine, tyres, fire) from one physics state
const carSound = (s, inp, dt) => s && { flame: LEVEL.hazards.reduce((m, h, i) => h.type === 'flame' && s.hazards[i].on ? Math.max(m, 1 - Math.abs(h.x - s.car[0]) / 10) : m, 0), scrape: s.scrape, on: s.power && !s.won, gas: !!(inp & (KEY.left | KEY.right)), rpm: s.rpm, speed: Math.abs(s.speed), grounded: s.grounded, fire: s.engineDead || s.fuse ? 1 : 0, dt };
function handle(evs, live){ const camX = st ? st.car[0] : 0; for (const e of evs){ pending.push(e); shake = Math.max(shake, react(e, camX)); if (e[0] === 'end' && live) showResult(e[1]); } }
const RES = { win: '🚪', boom: '🔥', wrecked: '💥', stuck: '🪤', timeout: '⏳' };
function showResult(r){ lastResult = r; mode = 'result'; const m = Math.max(0, Math.round(st.car[0] - LEVEL.start)); if (m > best){ best = m; store.set('br-best', best); }
  $('#resEmoji').textContent = RES[r] || '💀'; $('#resText').textContent = r === 'win' ? `you got out · ${Math.round(st.integrity * 100)}% of the car left` : `${m} m · ${r === 'boom' ? 'blown to pieces' : r === 'wrecked' ? 'wrecked' : r === 'stuck' ? 'stuck' : 'out of time'}`;
  $('#like').classList.remove('on'); show($('#pad'), false); show($('#result')); }
$('#like').onclick = () => {
  if (likedThis){ likes = likes.filter(l => l.id !== likedThis); likedThis = null; $('#like').classList.remove('on'); saveLikes(); return; }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); likedThis = id;
  likes.push({ id, inputs: packInputs(rec), result: lastResult, caption: '', thumb: thumb() }); saveLikes(); $('#like').classList.add('on'); S.pop(); };
// the button presses of a run, run-length encoded: "mask*count,mask*count,..."
const packInputs = a => { const out = []; for (const m of a){ const l = out[out.length - 1]; if (l && l[0] === m) l[1]++; else out.push([m, 1]); } return out.map(([m, n]) => `${m}*${n}`).join(','); };
const unpackInputs = s => { const a = []; for (const r of (s || '').split(',')){ if (!r) continue; const [m, n] = r.split('*').map(Number); for (let i = 0; i < n; i++) a.push(m); } return a; };
function thumb(){ const c = document.createElement('canvas'), s = view.canvas, w = 240, h = Math.round(w * s.height / s.width); c.width = w; c.height = Math.min(h, 320); const g = c.getContext('2d'); g.drawImage(s, 0, (s.height - c.height * s.width / w) / 2, s.width, c.height * s.width / w, 0, 0, w, c.height); return c.toDataURL('image/jpeg', .7); }
function hud(){ if (!st) return; const k = Math.max(0, st.integrity) * 100; $('#meter i').style.width = k + '%'; $('#meter').classList.toggle('low', k < 30 || !st.power); $('#dist').textContent = `${Math.max(0, Math.round(st.car[0] - LEVEL.start))} / ${LEVEL.exit} m`; }

// ---------------- main loop
let last = performance.now(), lastInp = 0;
function frame(now){ const dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
  if ((mode === 'play' || mode === 'result') && sim){ acc += dt; let n = 0; while (acc >= DT && n++ < 6){ const inp = mode === 'play' && !st.won ? input() : 0; lastInp = inp; rec.push(inp); const ev = sim.step(inp); handle(ev, mode === 'play'); acc -= DT; } st = sim.state(); hud(); }
  if (mode !== 'export'){ S.ambience(true); S.drive(mode === 'menu' ? null : carSound(st, lastInp, dt)); }
  shake *= Math.pow(.02, dt);
  if (mode !== 'export'){ view.render(clock, mode === 'menu' ? null : st, { shake, events: pending }); pending = []; }
  requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// ---------------- liked list
$('#likedBtn').onclick = openLiked;
$('#likedBack').onclick = toMenu;
function openLiked(){ mode = 'liked'; show($('#menu'), false); show($('#liked')); renderLiked(); }
function renderLiked(){ const box = $('#likeList'); box.innerHTML = '';
  likes.forEach((l, i) => { const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<img src="${l.thumb || ''}" alt=""><div class="meta"><b>${RES[l.result] || ''} ${({ win: 'escaped', boom: 'blown up', wrecked: 'wrecked', stuck: 'stuck' })[l.result] || ''}</b><input placeholder="caption" maxlength="60"></div><div class="ord"><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button></div>`;
    const inp = d.querySelector('input'); inp.value = l.caption || ''; inp.oninput = () => { l.caption = inp.value; saveLikes(); };
    d.querySelectorAll('button').forEach(b => b.onclick = () => { const a = b.dataset.a;
      if (a === 'up' && i > 0) [likes[i - 1], likes[i]] = [likes[i], likes[i - 1]];
      if (a === 'down' && i < likes.length - 1) [likes[i + 1], likes[i]] = [likes[i], likes[i + 1]];
      if (a === 'del') likes.splice(i, 1);
      saveLikes(); renderLiked(); });
    box.appendChild(d); });
  $('#saveVideo').disabled = !likes.length; }
$('#saveVideo').onclick = () => exportVideo(likes.filter(l => l.inputs));

// ---------------- video export: replay every liked run frame by frame -> 1080x1920 60fps MP4 (only the 3D scene, no game UI)
const FPS = 60, VW = 1080, VH = 1920, VBITRATE = 24e6;
const ss = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let exporter = null, busy = false;
// physics is deterministic, so a quick dry run tells us how long each clip lasts
function planClip(it, last){ const inputs = unpackInputs(it.inputs), sm = createSim(LEVEL); let end = null, n = 0;
  while (sm.t < 200){ for (const [k] of sm.step(inputs[n++] || 0)) if (k === 'end') end = sm.t; if (end != null && sm.t > end + (last ? 1.2 : .4)) break; }
  return { it, inputs, frames: n }; }
async function pickVideo(){ if (!window.VideoEncoder) return null; const base = { width: VW, height: VH, bitrate: VBITRATE, framerate: FPS, bitrateMode: 'variable', latencyMode: 'quality' };
  for (const [codec, mux] of [['avc1.640034', 'avc'], ['avc1.4d0034', 'avc'], ['avc1.420034', 'avc'], ['vp09.00.51.08', 'vp9']]){ const c = { ...base, codec, ...(mux === 'avc' ? { avc: { format: 'avc' } } : {}) }; try { if ((await VideoEncoder.isConfigSupported(c)).supported) return [c, mux]; } catch {} } return null; }
async function pickAudio(){ if (!window.AudioEncoder) return null; for (const [codec, mux, bitrate] of [['mp4a.40.2', 'aac', 256000], ['opus', 'opus', 192000]]){ const c = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate }; try { if ((await AudioEncoder.isConfigSupported(c)).supported) return [c, mux]; } catch {} } return null; }
function setupExport(){ S.initAudio(); mode = 'export'; S.drive(null); show($('#liked'), false); show($('#export')); show($('#vid'), false); show($('#expDone'), false); show($('#out')); prog(0);
  const out = $('#out'), g = out.getContext('2d'); out.width = VW; out.height = VH;
  if (!exporter){ exporter = new View(document.createElement('canvas'), LEVEL); exporter.size(VW, VH, 1); exporter.safe = [.06, .04]; }
  const k = VW / 720, compose = (cap, flash) => { g.drawImage(exporter.canvas, 0, 0, VW, VH);
    if (cap){ g.font = `800 ${46 * k}px system-ui, -apple-system, Segoe UI, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; const tw = Math.min(VW - 60 * k, g.measureText(cap).width + 56 * k); g.fillStyle = 'rgba(0,0,0,.85)'; rr(g, (VW - tw) / 2, 150 * k, tw, 84 * k, 18 * k); g.fill(); g.fillStyle = '#fff'; g.fillText(cap, VW / 2, 193 * k, VW - 100 * k); }
    if (flash > 0){ g.fillStyle = `rgba(0,0,0,${flash})`; g.fillRect(0, 0, VW, VH); } };
  return { out, compose }; }
// renders one clip; `frame()` is awaited after every rendered frame
async function playClip(p, i, compose, frame, sfx){ const D = exporter; D.reset(); const sm = createSim(LEVEL); let clk = 0, sh = 0;
  for (let n = 0; n < p.frames; n++){ clk += 1 / FPS; sfx.at?.(); const evs = sm.step(p.inputs[n] || 0), s = sm.state(), camX = s.car[0];
    for (const e of evs) sh = Math.max(sh, react(e, camX)); sh *= Math.pow(.02, 1 / FPS);
    S.ambience(true); S.drive(carSound(s, p.inputs[n] || 0, 1 / FPS));
    D.render(clk, s, { shake: sh, events: evs }); compose(p.it.caption, i ? 1 - ss(0, .3, clk) : 0); if (await frame()) return; }
  S.drive(null); }
async function exportVideo(items){
  if (!items.length || busy) return; busy = true; let cancel = false; $('#closeExp').onclick = () => { cancel = true; };
  try {
    const { out, compose } = setupExport(), vc = await pickVideo();
    const ac = await pickAudio();
    if (!vc || !ac) return await exportRealtime(items, out, compose, () => cancel);
    const plan = items.map((it, i) => planClip(it, i === items.length - 1)), total = plan.reduce((a, p) => a + p.frames, 0), dur = total / FPS;
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: vc[1], width: VW, height: VH, frameRate: FPS }, audio: { codec: ac[1], numberOfChannels: 2, sampleRate: 48000 }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let err = null; const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => err = e }); venc.configure(vc[0]);
    const octx = new OfflineAudioContext(2, Math.ceil((dur + .5) * 48000), 48000), A = S.offline(octx);
    let f = 0; const sfx = { at: () => A.at(f / FPS) };
    const frame = async () => { const vf = new VideoFrame(out, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) }); venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 }); vf.close(); f++;
      while (venc.encodeQueueSize > 4) await sleep(2); if (f % 3 === 0){ prog(f / total * .95); await sleep(0); } if (err) throw err; return cancel; };
    for (let i = 0; i < plan.length && !cancel; i++) await playClip(plan[i], i, compose, frame, sfx);
    A.done();
    if (cancel){ venc.close(); return closeExport(); }
    await venc.flush(); if (err) throw err;
    const buf = await octx.startRendering(), aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => err = e }); aenc.configure(ac[0]);
    const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1), N = Math.min(buf.length, Math.ceil(dur * 48000));
    for (let o = 0; o < N; o += 4800){ const n = Math.min(4800, N - o), d = new Float32Array(n * 2); d.set(L0.subarray(o, o + n), 0); d.set(R0.subarray(o, o + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(o * 1e6 / 48000), data: d }); aenc.encode(ad); ad.close(); }
    await aenc.flush(); if (err) throw err;
    muxer.finalize(); finish(new Blob([muxer.target.buffer], { type: 'video/mp4' }), 'mp4');
  } catch (e){ console.error(e); alertBox('Video failed: ' + (e.message || e)); closeExport(); }
  finally { busy = false; } }
// fallback for browsers without WebCodecs: record in real time
async function exportRealtime(items, out, compose, cancelled){
  const stream = out.captureStream(FPS); S.audioStream().getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = ['video/mp4;codecs=avc1.640034,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: VBITRATE, audioBitsPerSecond: 256000 }), chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r); rec.start(500);
  const plan = items.map((it, i) => planClip(it, i === items.length - 1)), total = plan.reduce((a, p) => a + p.frames, 0); let f = 0, t0 = performance.now();
  const frame = async () => { f++; prog(f / total); const due = t0 + f * 1000 / FPS; while (performance.now() < due) await new Promise(r => requestAnimationFrame(r)); return cancelled(); };
  for (let i = 0; i < plan.length && !cancelled(); i++) await playClip(plan[i], i, compose, frame, {});
  rec.stop(); await done;
  if (cancelled()) return closeExport();
  const type = (mime || 'video/webm').split(';')[0]; finish(new Blob(chunks, { type }), type.includes('mp4') ? 'mp4' : 'webm'); }
function finish(blob, ext){ show($('#out'), false); const url = URL.createObjectURL(blob), name = `level-0-${new Date().toISOString().slice(0, 10)}.${ext}`;
  const v = $('#vid'); v.src = url; show(v); prog(1); show($('#expDone')); window.__lastVideo = blob;
  $('#dl').onclick = async () => { const dls = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
    if (dls){ try { await dls.save({ filename: name, data: blob }); } catch (e) {} return; }
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  const file = new File([blob], name, { type: blob.type }); $('#share').style.display = navigator.canShare && navigator.canShare({ files: [file] }) ? '' : 'none';
  $('#share').onclick = () => navigator.share({ files: [file] }).catch(() => {});
  $('#closeExp').onclick = closeExport; }
function alertBox(msg){ const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 4000); }
function closeExport(){ show($('#export'), false); const v = $('#vid'); v.pause(); mode = 'liked'; openLiked(); }
function prog(f){ $('#prog i').style.width = Math.min(100, f * 100) + '%'; }
function rr(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// stop iOS pinch / double-tap zoom from fighting the controls
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
toMenu(); requestAnimationFrame(() => document.body.classList.add('ready'));
window.__app = { LEVEL, play, get mode(){ return mode; }, get st(){ return st; }, held, view, exportVideo, get likes(){ return likes; } };
