import { LEVELS } from './levels.js?v=20261027000339';
import { createSim, inkLength, fitPoint, DT } from './physics.js?v=20261027000339';
import { Diorama } from './scene.js?v=20261027000339';
import * as S from './audio.js?v=20261027000339';
import { THEMES } from './themes.js?v=20261027000339';
import { swatch } from './textures.js?v=20261027000339';
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs?v=20261027000339';

const $ = s => document.querySelector(s), show = (el, v = true) => el.classList.toggle('hidden', !v);
const q = v => Math.round(v * 100) / 100;
const store = { get(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
let likes = store.get('dbg-likes', []), wins = store.get('dbg-wins', {});
const saveLikes = () => { if (!store.set('dbg-likes', likes)){ likes.forEach((l, i) => { if (i < likes.length - 6) l.thumb = ''; }); store.set('dbg-likes', likes); } updateLikeCount(); };

let ti = Math.max(0, THEMES.findIndex(t => t.id === store.get('dbg-theme', 'classic')));
const themeOf = id => THEMES.find(t => t.id === id) || THEMES[0];
const view = new Diorama($('#game'), THEMES[ti]);
const fit = () => view.size(innerWidth, innerHeight); addEventListener('resize', fit); fit();

let mode = 'menu', li = 0, level = LEVELS[0], strokes = [], cur = null, sim = null, st = null, acc = 0, clock = 0, shake = 0, winAt = null, endAt = null, lastResult = null, likedThis = null, drawing = false;

// ---------------- menu
function setTheme(i){ ti = (i + THEMES.length) % THEMES.length; store.set('dbg-theme', THEMES[ti].id); view.setTheme(THEMES[ti]); if (mode === 'draw') view.setInk(strokes); document.querySelectorAll('.sw').forEach((b, k) => b.classList.toggle('on', k === ti)); }
function buildThemes(){ const g = $('#themes'); if (g.children.length) return; THEMES.forEach((T, i) => { const b = document.createElement('button'); b.className = 'sw' + (i === ti ? ' on' : ''); b.title = T.name; b.setAttribute('aria-label', T.name); b.style.backgroundImage = `url(${swatch(T)})`; b.onclick = () => { setTheme(i); S.pop(); }; g.appendChild(b); }); }
$('#theme').onclick = () => { setTheme(ti + 1); S.pop(); const n = $('#lvname'); n.textContent = THEMES[ti].name; clearTimeout(n._t); n._t = setTimeout(() => n.textContent = `${li + 1}. ${level.name}`, 1200); };
function buildMenu(){ buildThemes(); const g = $('#levels'); g.innerHTML = '';
  LEVELS.forEach((L, i) => { const b = document.createElement('button'); b.className = 'lvl' + (wins[L.id] ? ' won' : '');
    const icon = { spinner: '⚙️', saw: '🪚', fan: '🌀' }[(L.hazards || [])[0]?.type] || '';
    b.innerHTML = `<b>${i + 1}</b><span>${L.name}</span><em>${icon}${wins[L.id] ? ' ✓' : ''}</em>`; b.onclick = () => startLevel(i); g.appendChild(b); }); updateLikeCount(); }
function updateLikeCount(){ $('#likedBtn').textContent = `👍 ${likes.length}`; $('#likedBtn').disabled = !likes.length; }
function toMenu(){ mode = 'menu'; S.drive(null); [$('#hud'), $('#tools'), $('#result'), $('#liked')].forEach(e => show(e, false)); show($('#menu')); buildMenu(); setLevel(li); }

// ---------------- level / drawing
function setLevel(i){ li = i; level = LEVELS[i]; view.setLevel(level); }
function startLevel(i){ S.initAudio(); setLevel(i); strokes = []; toDraw(); }
function toDraw(){ mode = 'draw'; sim = null; st = null; winAt = endAt = null; S.drive(null); view.resetCar(); view.clearFx(); view.setLevel(level); view.setInk(strokes);
  show($('#menu'), false); show($('#result'), false); show($('#liked'), false); show($('#hud')); show($('#tools')); $('#lvname').textContent = `${li + 1}. ${level.name}`; meter(); }
const used = () => inkLength(strokes);
function meter(){ const f = Math.max(0, 1 - used() / level.ink); $('#meter i').style.width = (f * 100) + '%'; $('#meter').classList.toggle('low', f < .15); $('#go').disabled = false; $('#undo').disabled = $('#clear').disabled = !strokes.length; }
const cv = $('#game');
cv.addEventListener('pointerdown', e => { S.initAudio(); if (mode !== 'draw' || used() >= level.ink - .05) return; let p = view.toWorld(e.clientX, e.clientY); if (!p) return; p = fitPoint(level, p[0], p[1]);
  cv.setPointerCapture(e.pointerId); drawing = true; cur = [p]; strokes.push(cur); view.beginStroke(p[0], p[1]); view.pen.visible = true; view.pen.position.set(p[0], p[1], 0); meter(); });
cv.addEventListener('pointermove', e => { if (!drawing) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs){ let p = view.toWorld(ev.clientX, ev.clientY); if (!p) continue; p = fitPoint(level, p[0], p[1]); const l = cur[cur.length - 1]; let d = Math.hypot(p[0] - l[0], p[1] - l[1]); if (d < .14) continue;
    const left = level.ink - used(); if (left <= .02){ endStroke(); return; } let x = p[0], y = p[1]; if (d > left){ const k = left / d; x = l[0] + (x - l[0]) * k; y = l[1] + (y - l[1]) * k; }
    const pt = fitPoint(level, x, y); if (pt[0] === l[0] && pt[1] === l[1]) continue; cur.push(pt); view.addInkSegment(l[0], l[1], pt[0], pt[1]); view.pen.position.set(pt[0], pt[1], 0); S.squeak(); } meter(); });
const endStroke = () => { if (!drawing) return; drawing = false; view.pen.visible = false; meter(); };
cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
$('#undo').onclick = () => { strokes.pop(); view.setInk(strokes); meter(); S.pop(); };
$('#clear').onclick = () => { strokes = []; view.setInk(strokes); meter(); S.whoosh(); };
$('#back').onclick = () => mode === 'run' || mode === 'result' ? toDraw() : toMenu();
addEventListener('keydown', e => { if (mode === 'draw' && (e.ctrlKey || e.metaKey) && e.key === 'z'){ $('#undo').onclick(); e.preventDefault(); } if (mode === 'draw' && e.key === 'Enter') go(); });

// ---------------- run
function go(){ if (mode !== 'draw') return; endStroke(); S.initAudio(); mode = 'run'; sim = createSim(level, strokes); st = sim.state(); acc = 0; shake = 0; winAt = endAt = null; lastResult = null; likedThis = null; pending = [];
  show($('#tools'), false); }
$('#go').onclick = go;
let pending = [], boomT = 0;
// one place that turns physics events into sound and camera shake (used by the game and by the video export)
function react(e, camX, simT){ const [k, a, b, c, d, f] = e, pan = x => (x - camX) / 9;
  if (k === 'hit') S.hit(a, b, c, pan(d));
  if (k === 'boom'){ S.boom(pan(a)); return .9; }
  if (k === 'crumble'){ S.crumble(c, pan(a)); return .12 + c * .2; }
  if (k === 'snap') S.snap(pan(a));
  if (k === 'partoff') S.partoff(pan(a));
  if (k === 'dent') S.dent(a, pan(b));
  if (k === 'spark') S.spark(pan(a));
  if (k === 'shot') S.shot(pan(a));
  if (k === 'fall') S.fall();
  if (k === 'win') S.win();
  if (k === 'crash') return a * .3;
  return 0; }
function handle(evs, live){ const camX = view.camState ? view.camState.tgt.x : 0; for (const e of evs){ pending.push(e); shake = Math.max(shake, react(e, camX));
  if (e[0] === 'win') winAt = sim.t; if (e[0] === 'boom') boomT = sim.t; if (e[0] === 'end'){ endAt = sim.t; if (live) showResult(e[1]); } } }
const RES = { win: '🏁', boom: '🔥', fell: '💥', stuck: '😐', timeout: '⏳' };
function showResult(r){ lastResult = r; mode = 'result'; if (r === 'win'){ wins[level.id] = 1; store.set('dbg-wins', wins); }
  $('#resEmoji').textContent = RES[r] || '💥'; $('#like').classList.remove('on'); show($('#next'), r === 'win' && li < LEVELS.length - 1); show($('#result')); }
$('#retry').onclick = () => toDraw();
$('#next').onclick = () => startLevel(li + 1);
$('#like').onclick = () => {
  if (likedThis){ likes = likes.filter(l => l.id !== likedThis); likedThis = null; $('#like').classList.remove('on'); saveLikes(); return; }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); likedThis = id;
  likes.push({ id, levelId: level.id, strokes: JSON.parse(JSON.stringify(strokes)), result: lastResult, theme: THEMES[ti].id, caption: '', thumb: thumb() }); saveLikes(); $('#like').classList.add('on'); S.pop(); };
function thumb(){ const c = document.createElement('canvas'), s = view.canvas, w = 240, h = Math.round(w * s.height / s.width); c.width = w; c.height = Math.min(h, 320); const g = c.getContext('2d'); g.drawImage(s, 0, (s.height - c.height * s.width / w) / 2, s.width, c.height * s.width / w, 0, 0, w, c.height); return c.toDataURL('image/jpeg', .7); }

// ---------------- main loop
let last = performance.now();
function frame(now){ const dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
  if ((mode === 'run' || mode === 'result') && sim){ acc += dt; let n = 0; while (acc >= DT && n++ < 6){ const ev = sim.step(); handle(ev, mode === 'run'); acc -= DT; } st = sim.state(); }
  if (mode !== 'export') S.drive(st && { on: !st.exploded && !st.won && st.t > .4, rpm: st.rpm, roll: st.roll, fire: st.exploded ? Math.max(0, 1 - (st.t - boomT) / 9) : st.fire ? .7 : 0, dt, pan: view.camState ? (st.car[0] - view.camState.tgt.x) / 9 : 0 });
  shake *= Math.pow(.02, dt);
  if (mode !== 'export'){ view.render(clock, st, { winAt, shake, events: pending }); pending = []; }
  requestAnimationFrame(frame); }
requestAnimationFrame(frame);

// ---------------- liked list
$('#likedBtn').onclick = openLiked;
$('#likedBack').onclick = toMenu;
function openLiked(){ mode = 'liked'; show($('#menu'), false); show($('#liked')); renderLiked(); }
function renderLiked(){ const box = $('#likeList'); box.innerHTML = '';
  likes.forEach((l, i) => { const L = LEVELS.find(x => x.id === l.levelId), d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<img src="${l.thumb || ''}" alt=""><div class="meta"><b>${L ? L.name : l.levelId} ${RES[l.result] || ''}</b><input placeholder="caption" maxlength="60"></div><div class="ord"><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button></div>`;
    const inp = d.querySelector('input'); inp.value = l.caption || ''; inp.oninput = () => { l.caption = inp.value; saveLikes(); };
    d.querySelectorAll('button').forEach(b => b.onclick = () => { const a = b.dataset.a;
      if (a === 'up' && i > 0) [likes[i - 1], likes[i]] = [likes[i], likes[i - 1]];
      if (a === 'down' && i < likes.length - 1) [likes[i + 1], likes[i]] = [likes[i], likes[i + 1]];
      if (a === 'del') likes.splice(i, 1);
      saveLikes(); renderLiked(); });
    box.appendChild(d); });
  $('#saveVideo').disabled = !likes.length; }
$('#saveVideo').onclick = () => exportVideo(likes.filter(l => LEVELS.some(L => L.id === l.levelId)));

// ---------------- video export: replay every liked run frame by frame -> 1080x1920 60fps MP4 (only the 3D scene, no game UI)
const FPS = 60, VW = 1080, VH = 1920, VBITRATE = 24e6;
const ss = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let exporter = null, busy = false;
// physics is deterministic, so a quick dry run tells us how long each clip lasts
function planClip(it, last){ const L = LEVELS.find(x => x.id === it.levelId), len = inkLength(it.strokes), drawDur = Math.min(2.6, Math.max(.7, len / 11)), sm = createSim(L, it.strokes); let end = null;
  while (sm.t < 40){ for (const [k] of sm.step()) if (k === 'end') end = sm.t; if (end != null && sm.t > end + (last ? 1.4 : .5)) break; }
  return { it, L, len, drawDur, drawFrames: Math.round((drawDur + .35) * FPS), runFrames: Math.round(sm.t * FPS) }; }
async function pickVideo(){ if (!window.VideoEncoder) return null; const base = { width: VW, height: VH, bitrate: VBITRATE, framerate: FPS, bitrateMode: 'variable', latencyMode: 'quality' };
  for (const [codec, mux] of [['avc1.640034', 'avc'], ['avc1.4d0034', 'avc'], ['avc1.420034', 'avc'], ['vp09.00.51.08', 'vp9']]){ const c = { ...base, codec, ...(mux === 'avc' ? { avc: { format: 'avc' } } : {}) }; try { if ((await VideoEncoder.isConfigSupported(c)).supported) return [c, mux]; } catch {} } return null; }
async function pickAudio(){ if (!window.AudioEncoder) return null; for (const [codec, mux, bitrate] of [['mp4a.40.2', 'aac', 256000], ['opus', 'opus', 192000]]){ const c = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate }; try { if ((await AudioEncoder.isConfigSupported(c)).supported) return [c, mux]; } catch {} } return null; }
function setupExport(){ S.initAudio(); mode = 'export'; show($('#liked'), false); show($('#export')); show($('#vid'), false); show($('#expDone'), false); show($('#out')); prog(0);
  const out = $('#out'), g = out.getContext('2d'); out.width = VW; out.height = VH;
  if (!exporter){ exporter = new Diorama(document.createElement('canvas'), THEMES[0]); exporter.size(VW, VH, 1); exporter.margin = 1.08; }
  const k = VW / 720, compose = (cap, flash) => { g.drawImage(exporter.canvas, 0, 0, VW, VH);
    if (cap){ g.font = `800 ${46 * k}px system-ui, -apple-system, Segoe UI, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; const tw = Math.min(VW - 60 * k, g.measureText(cap).width + 56 * k); g.fillStyle = 'rgba(0,0,0,.85)'; rr(g, (VW - tw) / 2, 150 * k, tw, 84 * k, 18 * k); g.fill(); g.fillStyle = '#fff'; g.fillText(cap, VW / 2, 193 * k, VW - 100 * k); }
    if (flash > 0){ g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, VW, VH); } };
  return { out, compose }; }
// renders one clip; `frame()` is awaited after every rendered frame
async function playClip(p, i, compose, frame, sfx){ const D = exporter, it = p.it; D.setTheme(themeOf(it.theme)); D.setLevel(p.L); D.resetCar(); D.clearFx(); let clk = 0;
  for (let n = 0; n < p.drawFrames; n++){ const t = n / FPS; clk = t; sfx.at?.();
    const upto = p.len * ss(.15, p.drawDur, t), tip = D.setInk(it.strokes, upto); D.pen.visible = !!tip && t > .1 && t < p.drawDur + .1; if (tip) D.pen.position.set(tip[0], tip[1], 0); if (upto > 0 && upto < p.len) S.squeak();
    D.render(clk, null, {}); compose(it.caption, i ? 1 - ss(0, .3, t) : 0); if (await frame()) return; }
  D.pen.visible = false; D.setInk(it.strokes);
  const sm = createSim(p.L, it.strokes); let wAt = null, sh = 0, boomT = null; sfx.at?.();
  for (let n = 0; n < p.runFrames; n++){ clk += 1 / FPS; sfx.at?.();
    const evs = sm.step(), camX = D.camState ? D.camState.tgt.x : 0; for (const e of evs){ sh = Math.max(sh, react(e, camX)); if (e[0] === 'win') wAt = sm.t; if (e[0] === 'boom') boomT = sm.t; }
    const s = sm.state(); sh *= Math.pow(.02, 1 / FPS);
    S.drive({ on: !s.exploded && !s.won && s.t > .4, rpm: s.rpm, roll: s.roll, fire: s.exploded ? Math.max(0, 1 - (s.t - boomT) / 9) : s.fire ? .7 : 0, dt: 1 / FPS, pan: (s.car[0] - camX) / 9 });
    D.render(clk, s, { winAt: wAt, shake: sh, events: evs }); compose(it.caption, 0); if (await frame()) return; }
  S.drive(null); }
async function exportVideo(items){
  if (!items.length || busy) return; busy = true; let cancel = false; $('#closeExp').onclick = () => { cancel = true; };
  try {
    const { out, compose } = setupExport(), vc = await pickVideo();
    const ac = await pickAudio();
    if (!vc || !ac) return await exportRealtime(items, out, compose, () => cancel);
    const plan = items.map((it, i) => planClip(it, i === items.length - 1)), total = plan.reduce((a, p) => a + p.drawFrames + p.runFrames, 0), dur = total / FPS;
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: vc[1], width: VW, height: VH, frameRate: FPS }, ...(ac ? { audio: { codec: ac[1], numberOfChannels: 2, sampleRate: 48000 } } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let err = null; const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => err = e }); venc.configure(vc[0]);
    const octx = new OfflineAudioContext(2, Math.ceil((dur + .5) * 48000), 48000), A = S.offline(octx);
    let f = 0; const sfx = { at: () => A.at(f / FPS) };
    const frame = async () => { const vf = new VideoFrame(out, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) }); venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 }); vf.close(); f++;
      while (venc.encodeQueueSize > 4) await sleep(2); if (f % 3 === 0){ prog(f / total * .95); await sleep(0); } if (err) throw err; return cancel; };
    for (let i = 0; i < plan.length && !cancel; i++) await playClip(plan[i], i, compose, frame, sfx);
    A.done();
    if (cancel){ venc.close(); return closeExport(); }
    await venc.flush(); if (err) throw err;
    if (ac){ const buf = await octx.startRendering(), aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => err = e }); aenc.configure(ac[0]);
      const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1), N = Math.min(buf.length, Math.ceil(dur * 48000));
      for (let o = 0; o < N; o += 4800){ const n = Math.min(4800, N - o), d = new Float32Array(n * 2); d.set(L0.subarray(o, o + n), 0); d.set(R0.subarray(o, o + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(o * 1e6 / 48000), data: d }); aenc.encode(ad); ad.close(); }
      await aenc.flush(); if (err) throw err; }
    muxer.finalize(); finish(new Blob([muxer.target.buffer], { type: 'video/mp4' }), 'mp4');
  } catch (e){ console.error(e); alertBox('Video failed: ' + (e.message || e)); closeExport(); }
  finally { busy = false; } }
// fallback for browsers without WebCodecs: record in real time
async function exportRealtime(items, out, compose, cancelled){
  const stream = out.captureStream(FPS); S.audioStream().getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = ['video/mp4;codecs=avc1.640034,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: VBITRATE, audioBitsPerSecond: 256000 }), chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r); rec.start(500);
  const plan = items.map((it, i) => planClip(it, i === items.length - 1)), total = plan.reduce((a, p) => a + p.drawFrames + p.runFrames, 0); let f = 0, t0 = performance.now();
  const frame = async () => { f++; prog(f / total); const due = t0 + f * 1000 / FPS; while (performance.now() < due) await new Promise(r => requestAnimationFrame(r)); return cancelled(); };
  for (let i = 0; i < plan.length && !cancelled(); i++) await playClip(plan[i], i, compose, frame, {});
  rec.stop(); await done;
  if (cancelled()) return closeExport();
  const type = (mime || 'video/webm').split(';')[0]; finish(new Blob(chunks, { type }), type.includes('mp4') ? 'mp4' : 'webm'); }
function finish(blob, ext){ show($('#out'), false); const url = URL.createObjectURL(blob), name = `draw-bridge-${new Date().toISOString().slice(0, 10)}.${ext}`;
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

// stop iOS pinch / double-tap zoom from fighting the drawing
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
toMenu(); requestAnimationFrame(() => document.body.classList.add('ready'));
window.__app = { go, get mode(){ return mode; }, get strokes(){ return strokes; }, set strokes(v){ strokes = v; view.setInk(v); meter(); }, view, startLevel, exportVideo, get likes(){ return likes; } };
