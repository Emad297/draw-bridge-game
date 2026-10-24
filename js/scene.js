// The 3D diorama: towers, car, ink, hazards, clouds, flag, confetti — plus the camera.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor-rbox.js';
import { mergeGeometries } from './vendor-bgu.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.min(1, Math.max(0, x)), lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const backOut = x => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .7, ...o });
const geoC = new Map(); const rbox = (w, h, d, r = .06) => { const k = [w, h, d, r].join(); if (!geoC.has(k)) geoC.set(k, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) * .49))); return geoC.get(k); };
function kit(){ const parts = new Map(); return {
  box(w, h, d, c, x = 0, y = 0, z = 0, o = {}){ const g = rbox(w, h, d, o.r ?? .05).clone(); g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), V(1, 1, 1))); if (!parts.has(c)) parts.set(c, []); parts.get(c).push(g); return this; },
  into(group, o = {}){ for (const [c, l] of parts){ const m = new THREE.Mesh(mergeGeometries(l), mat(c, o)); m.castShadow = m.receiveShadow = true; group.add(m); } parts.clear(); return group; } }; }
function brickTex(rx, ry){ const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; const g = cv.getContext('2d'); g.fillStyle = '#e8d3c0'; g.fillRect(0, 0, 512, 512);
  for (let r = 0; r < 16; r++) for (let c = -1; c < 9; c++){ const x = c * 64 + (r % 2) * 32, y = r * 32, h = (r * 7 + c * 13) % 9; g.fillStyle = ['#b9452b', '#c24f33', '#a83e27', '#cc5a3a', '#b04a31'][h % 5]; g.fillRect(x + 3, y + 3, 58, 26); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 3, y + 3, 58, 5); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }
function stripeTex(){ const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; const g = cv.getContext('2d'); g.fillStyle = '#ffcf1f'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#1b1b1f'; for (let x = -32; x < 256; x += 32){ g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

export class Diorama {
  constructor(canvas){
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(36, 9 / 16, .1, 600);
    { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#2f45ff'); gr.addColorStop(.55, '#5a78ff'); gr.addColorStop(1, '#a9c0ff'); g.fillStyle = gr; g.fillRect(0, 0, 4, 512); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
    scene.fog = new THREE.Fog('#8fa8ff', 35, 110);
    scene.add(new THREE.HemisphereLight('#eef2ff', '#6a5a7a', 1.3));
    const sun = this.sun = new THREE.DirectionalLight('#fff4e0', 2.8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; scene.add(sun, sun.target);
    this.levelG = new THREE.Group(); scene.add(this.levelG);
    this.inkM = mat('#141414', { roughness: .35 }); this.inkG = new THREE.Group(); scene.add(this.inkG); this.inkSegs = [];
    this.cyl = new THREE.CylinderGeometry(.09, .09, 1, 10); this.cap = new THREE.SphereGeometry(.09, 10, 8);
    this.buildClouds(); this.buildCar(); this.buildPen(); this.buildConfetti();
    this.plane = new THREE.Plane(V(0, 0, 1), 0); this.ray = new THREE.Raycaster();
    this.camState = null;
  }
  size(w, h, pr = Math.min(window.devicePixelRatio || 1, 2)){ this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.W = w; this.H = h; }
  // ---------------- world pieces
  buildClouds(){ const m = mat('#ffffff', { roughness: .95 }); this.clouds = [];
    for (let i = 0; i < 16; i++){ const g = new THREE.Group(), r = k => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
      for (let k = 0; k < 4; k++){ const s = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), m); s.position.set(k * 1.1 - 1.6, Math.sin(k * 2) * .3, 0); s.scale.set(1.2 + r(k) * .6, .8 + r(k + 5) * .4, .9); g.add(s); }
      const below = i < 8; g.position.set((r(1) - .5) * 50, below ? -7 - r(2) * 20 : 5 + r(2) * 16, below ? -7 - r(3) * 10 : -20 - r(3) * 22); g.scale.setScalar(below ? .9 + r(4) : 1.4 + r(4)); this.scene.add(g); this.clouds.push({ g, x0: g.position.x, v: .2 + r(6) * .3 }); } }
  buildCar(){ const g = new THREE.Group(), body = new THREE.Group(); g.add(body); const k = kit(), Y = '#ffcf1f';
    k.box(1.9, .5, 1.1, Y, 0, -.02, 0, { r: .18 }).box(1.1, .45, 1.0, Y, -.12, .42, 0, { r: .16 }).box(.04, .36, .9, '#24324a', .44, .42, 0, { r: .02, rz: -.35 }).box(.04, .34, .9, '#24324a', -.68, .42, 0, { r: .02, rz: .3 }).box(.8, .3, .02, '#24324a', -.12, .44, .505, { r: .02 }).box(.8, .3, .02, '#24324a', -.12, .44, -.505, { r: .02 });
    k.box(.08, .14, .26, '#fff7d1', .95, .04, .32, { r: .03 }).box(.08, .14, .26, '#fff7d1', .95, .04, -.32, { r: .03 }).box(.06, .12, .2, '#e5452f', -.95, .06, .34, { r: .02 }).box(.06, .12, .2, '#e5452f', -.95, .06, -.34, { r: .02 }).box(1.92, .12, 1.12, '#333', 0, -.24, 0, { r: .05 });
    k.into(body, { roughness: .45 });
    const wheels = [0, 1].map(() => { const w = new THREE.Group(); for (const z of [-.5, .5]){ const t = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .22, 24), mat('#1d1d22', { roughness: .8 })); t.rotation.x = Math.PI / 2; t.position.z = z; t.castShadow = true; w.add(t); const h = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .24, 16), mat('#f2f2f2', { roughness: .4 })); h.rotation.x = Math.PI / 2; h.position.z = z; w.add(h); const sp = new THREE.Mesh(rbox(.26, .05, .25, .01), mat('#9aa0a8')); sp.position.z = z; w.add(sp); } this.scene.add(w); return w; });
    this.scene.add(g); this.car = { g, body, wheels }; }
  buildPen(){ const p = this.pen = new THREE.Group(), k = kit(); k.box(.22, 1.5, .22, '#1c1c22', 0, .95, 0, { r: .1 }).box(.24, .36, .24, '#ffcf1f', 0, 1.5, 0, { r: .1 }).box(.12, .25, .12, '#111', 0, .12, 0, { r: .04 }); k.into(p); p.rotation.z = -.35; p.rotation.x = .25; p.visible = false; this.scene.add(p); }
  buildConfetti(){ this.CONF = Array.from({ length: 120 }, (_, i) => ({ vx: Math.cos(i * 2.4) * (1 + i % 5 * .5), vz: Math.sin(i * 2.4) * (1 + i % 4 * .4), vy: 7 + (i % 7) * .9, rot: i, col: ['#ffcf1f', '#ff5a5a', '#46d38a', '#5aa0ff', '#ff7ae0', '#ffffff'][i % 6] }));
    const c = this.conf = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .02, .1), mat('#fff'), this.CONF.length); this.CONF.forEach((q, i) => c.setColorAt(i, new THREE.Color(q.col))); c.count = 0; this.scene.add(c); this.o3 = new THREE.Object3D(); }
  setLevel(L){
    this.level = L; const G = this.levelG; while (G.children.length) G.remove(G.children[0]);
    for (const [x0, x1, top] of L.solids){ const w = Math.min(x1, 40) - Math.max(x0, -40), cx = (Math.min(x1, 40) + Math.max(x0, -40)) / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 40, 5), [mat('#c24f33', { map: brickTex(1.25, 10) }), mat('#c24f33', { map: brickTex(1.25, 10) }), mat('#d9c7b2'), mat('#c24f33'), mat('#c24f33', { map: brickTex(Math.max(.4, w / 4), 10) }), mat('#c24f33')]);
      m.position.set(cx, top - 20, 0); m.castShadow = m.receiveShadow = true; G.add(m);
      const cap = new THREE.Mesh(rbox(w + .3, .35, 5.4, .1), mat('#e9dccb')); cap.position.set(cx, top - .155, 0); cap.castShadow = cap.receiveShadow = true; G.add(cap); }
    // flag
    const f = new THREE.Group(), k = kit(); k.box(.09, 2.6, .09, '#222', 0, 1.3, 0, { r: .03 }).box(.3, .12, .3, '#222', 0, .06, 0); k.into(f);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .9, 12, 4), mat('#ffe14a', { side: THREE.DoubleSide, roughness: .8 })); cloth.position.set(.7, 2.1, 0); f.add(cloth); f.position.set(L.flag[0], L.flag[1], 0); G.add(f);
    this.cloth = cloth; this.clothBase = cloth.geometry.attributes.position.array.slice();
    // hazards
    this.hz = (L.hazards || []).map(h => this.buildHazard(h));
    this.clearInk(); this.camState = null;
  }
  buildHazard(h){ const G = this.levelG, steel = mat('#c9ced6', { roughness: .25, metalness: .8 }), dark = mat('#2a2c33', { roughness: .4, metalness: .6 });
    if (h.type === 'spinner'){ const pil = new THREE.Mesh(new THREE.BoxGeometry(1.3, 40, 1.3), mat('#c24f33', { map: brickTex(.4, 14) })); pil.position.set(h.x, h.y - 20.4, 0); pil.castShadow = pil.receiveShadow = true; G.add(pil);
      const s = new THREE.Group(); s.position.set(h.x, h.y, 0); G.add(s); const hub = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .9, 32), dark); hub.rotation.x = Math.PI / 2; s.add(hub);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, 1.0, 24), mat('#e5452f', { roughness: .4 })); cap.rotation.x = Math.PI / 2; s.add(cap); const stripe = mat('#fff', { map: stripeTex(), roughness: .5 });
      for (let k = 0; k < h.arms; k++){ const arm = new THREE.Group(); arm.rotation.z = k / h.arms * Math.PI * 2; s.add(arm); const bar = new THREE.Mesh(rbox(h.len, .3, .5, .08), stripe); bar.position.x = h.len / 2; bar.castShadow = true; arm.add(bar);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(.32, .62, 20), steel); tip.rotation.z = -Math.PI / 2; tip.position.x = h.len + .28; arm.add(tip); for (const sd of [-1, 1]){ const sp = new THREE.Mesh(new THREE.ConeGeometry(.12, .34, 12), steel); sp.position.set(h.len * .62, sd * .3, 0); sp.rotation.z = sd > 0 ? 0 : Math.PI; arm.add(sp); } }
      const bul = new THREE.InstancedMesh(new THREE.ConeGeometry(.12, .62, 14), steel, 40); bul.count = 0; G.add(bul); return { h, s, bul }; }
    if (h.type === 'saw'){ const s = new THREE.Group(); G.add(s); const disc = new THREE.Mesh(new THREE.CylinderGeometry(h.r * .85, h.r * .85, .12, 40), steel); disc.rotation.x = Math.PI / 2; s.add(disc);
      for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, t = new THREE.Mesh(new THREE.ConeGeometry(.16, .4, 4), steel); t.position.set(Math.cos(a) * h.r * .95, Math.sin(a) * h.r * .95, 0); t.rotation.z = a - Math.PI / 2 - .4; s.add(t); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .3, 20), mat('#e5452f')); hub.rotation.x = Math.PI / 2; s.add(hub);
      const rail = new THREE.Mesh(rbox(Math.hypot(h.path[1][0] - h.path[0][0], h.path[1][1] - h.path[0][1]) + 1, .14, .14, .05), dark); rail.position.set((h.path[0][0] + h.path[1][0]) / 2, (h.path[0][1] + h.path[1][1]) / 2, -.35); G.add(rail); return { h, s }; }
    if (h.type === 'fan'){ const s = new THREE.Group(); s.position.set(h.x, h.y, 0); G.add(s); const housing = new THREE.Mesh(new THREE.CylinderGeometry(h.width / 2 + .2, h.width / 2 + .3, .6, 36, 1, true), mat('#3a3f4a', { side: THREE.DoubleSide, metalness: .5, roughness: .4 })); s.add(housing);
      const blades = new THREE.Group(); s.add(blades); for (let k = 0; k < 5; k++){ const b = new THREE.Mesh(rbox(h.width / 2 - .1, .06, .5, .03), mat('#e6e9ee', { metalness: .6, roughness: .3 })); b.position.x = h.width / 4; b.rotation.x = .5; const arm = new THREE.Group(); arm.rotation.y = k / 5 * Math.PI * 2; arm.add(b); blades.add(arm); }
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1.0, 40, 1.0), mat('#3a3f4a')); pil.position.set(h.x, h.y - 20.3, 0); G.add(pil);
      const wind = new THREE.InstancedMesh(new THREE.BoxGeometry(.05, .9, .05), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .55 }), 40); G.add(wind); return { h, s, blades, wind }; }
    return { h }; }
  // ---------------- ink
  clearInk(){ while (this.inkG.children.length) this.inkG.remove(this.inkG.children[0]); this.inkSegs = []; this.inkG.position.set(0, 0, 0); this.inkG.rotation.set(0, 0, 0); }
  addInkSegment(x0, y0, x1, y1){ const L = Math.hypot(x1 - x0, y1 - y0), m = new THREE.Mesh(this.cyl, this.inkM); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2; m.scale.set(1, Math.max(.001, L), 1); m.castShadow = true;
    const c = new THREE.Mesh(this.cap, this.inkM); c.position.set(x1, y1, 0); this.inkG.add(m, c); this.inkSegs.push([m, c]); }
  addInkDot(x, y){ const c = new THREE.Mesh(this.cap, this.inkM); c.position.set(x, y, 0); c.scale.setScalar(1.2); this.inkG.add(c); this.inkSegs.push([c]); }
  setInk(strokes, upto = Infinity){ this.clearInk(); let acc = 0, tip = null;
    for (const s of strokes){ if (acc >= upto) break; const c0 = new THREE.Mesh(this.cap, this.inkM); c0.position.set(s[0][0], s[0][1], 0); this.inkG.add(c0); tip = s[0];
      if (s.length === 1){ continue; }
      for (let i = 1; i < s.length; i++){ const [x0, y0] = s[i - 1], [x1, y1] = s[i], L = Math.hypot(x1 - x0, y1 - y0); if (acc + L <= upto){ this.addInkSegment(x0, y0, x1, y1); acc += L; tip = s[i]; } else { const k = (upto - acc) / L; const x = lerp(x0, x1, k), y = lerp(y0, y1, k); this.addInkSegment(x0, y0, x, y); acc = upto; tip = [x, y]; break; } } }
    return tip; }
  // pointer -> world point on the drawing plane
  toWorld(px, py){ const r = this.canvas.getBoundingClientRect(), v = new THREE.Vector2((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(v, this.camera); const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.plane, p) ? [p.x, p.y] : null; }
  // ---------------- camera
  frameCamera(t, carPos, follow, winPush = 0){
    const [vx, vy, vw, vh] = this.level.view, cam = this.camera, vfov = cam.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const dist = Math.max(vw / 2 / Math.tan(hfov / 2), vh / 2 / Math.tan(vfov / 2)) * (this.margin || 1.12);
    let tgt = V(vx, vy, 0);
    if (follow && carPos){ const low = Math.min(...this.level.solids.map(s => s[2])); carPos = [Math.min(Math.max(carPos[0], vx - vw * .6), vx + vw * .6), Math.max(carPos[1], low - 7)]; const off = carPos[1] < Math.min(...this.level.solids.map(s => s[2])) - 3 || carPos[1] > vy + vh / 2 - 1 || Math.abs(carPos[0] - vx) > vw / 2 - 1; tgt = V(lerp(vx, carPos[0], off ? .75 : .1), lerp(vy, carPos[1], off ? .8 : .08), 0); }
    if (winPush > 0) tgt.lerp(V(this.level.flag[0] - .6, this.level.flag[1] + 1, 0), winPush);
    if (!this.camState || t < this.camState.t || t - this.camState.t > .25) this.camState = { tgt: tgt.clone(), t }; else { const k = 1 - Math.exp(-(t - this.camState.t) * 3.2); this.camState.tgt.lerp(tgt, k); this.camState.t = t; }
    const c = this.camState.tgt, az = this.drawMode ? .12 : .22 + Math.sin(t * .23) * .04 - winPush * .1, el = this.drawMode ? .08 : .12 + Math.sin(t * .17) * .02, d = dist * (1 - winPush * .4);
    cam.position.set(c.x + Math.sin(az) * Math.cos(el) * d, c.y + Math.sin(el) * d, c.z + Math.cos(az) * Math.cos(el) * d); cam.lookAt(c.x, c.y, 0);
    this.sun.position.set(c.x + 8, c.y + 16, 14); this.sun.target.position.copy(c); }
  // ---------------- draw one frame from a physics state (or the idle start state)
  render(t, st, opts = {}){
    const L = this.level;
    if (st){ this.inkG.position.set(st.ink[0], st.ink[1], 0); this.inkG.rotation.z = st.ink[2]; this.car.g.position.set(st.car[0], st.car[1] - .02, 0); this.car.g.rotation.z = st.car[2]; this.car.wheels.forEach((w, i) => { w.position.set(st.wheels[i][0], st.wheels[i][1], 0); w.rotation.z = st.wheels[i][2]; }); }
    else { this.car.g.position.set(L.car[0], L.car[1] - .02, 0); this.car.g.rotation.z = 0; this.car.wheels.forEach((w, i) => { w.position.set(L.car[0] + (i ? .55 : -.55), L.car[1] - .37, 0); w.rotation.z = 0; }); }
    this.car.body.position.y = st ? 0 : Math.sin(t * 30) * .01;
    for (let i = 0; i < this.cloth.geometry.attributes.position.count; i++){ const x = this.clothBase[i * 3] + .65; this.cloth.geometry.attributes.position.setZ(i, Math.sin(x * 4 - t * 6) * .12 * x); } this.cloth.geometry.attributes.position.needsUpdate = true;
    this.clouds.forEach(c => c.g.position.x = c.x0 + Math.sin(t * .05 + c.v * 9) * 3 + t * c.v * .4);
    const o3 = this.o3, simT = st ? st.t : 0;
    this.hz.forEach((o, i) => { const h = o.h, hs = st && st.hazards[i];
      if (h.type === 'spinner'){ o.s.rotation.z = hs ? hs.spin : 0; let n = 0; if (hs) for (const b of hs.bullets){ if (b[3] > 3.2) continue; o3.position.set(b[0], b[1], 0); o3.rotation.set(0, 0, b[2]); o3.scale.setScalar(1); o3.updateMatrix(); o.bul.setMatrixAt(n++, o3.matrix); } o.bul.count = n; o.bul.instanceMatrix.needsUpdate = true; }
      if (h.type === 'saw'){ if (hs){ o.s.position.set(hs.pos[0], hs.pos[1], 0); o.s.rotation.z = hs.pos[2]; } else { o.s.position.set(h.path[0][0], h.path[0][1], 0); o.s.rotation.z = 0; } }
      if (h.type === 'fan'){ o.blades.rotation.y = t * 14; for (let k = 0; k < 40; k++){ const u = ((t * 1.3 + k * .137) % 1), sx = ((k * 7919) % 100) / 100 - .5; o3.position.set(h.x + sx * h.width * .9, h.y + .4 + u * h.length, ((k * 31) % 10) / 10 - .5); o3.rotation.set(0, 0, 0); o3.scale.set(1, .5 + (1 - u), 1); o3.updateMatrix(); o.wind.setMatrixAt(k, o3.matrix); } o.wind.instanceMatrix.needsUpdate = true; } });
    if (opts.winAt != null && simT > opts.winAt){ const q = simT - opts.winAt; this.conf.count = this.CONF.length; this.CONF.forEach((c, i) => { o3.position.set(L.flag[0] - .4 + c.vx * q, L.flag[1] + 2.4 + c.vy * q - 5 * q * q, c.vz * q); o3.rotation.set(c.rot + q * 5, c.rot + q * 3, 0); o3.scale.setScalar(1); o3.updateMatrix(); this.conf.setMatrixAt(i, o3.matrix); }); this.conf.instanceMatrix.needsUpdate = true; } else this.conf.count = 0;
    this.frameCamera(t, st ? st.car : null, !!st, opts.winAt != null && simT > opts.winAt ? ss(opts.winAt, opts.winAt + 1.2, simT) : 0);
    if (opts.shake){ this.camera.position.x += Math.sin(t * 91) * opts.shake; this.camera.position.y += Math.cos(t * 77) * opts.shake; }
    this.renderer.render(this.scene, this.camera);
  }
}
