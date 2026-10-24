// The 3D diorama: towers, car, ink, hazards, clouds, flag, confetti — plus the camera.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor-rbox.js?v=20261024194841';
import { mergeGeometries } from './vendor-bgu.js?v=20261024194841';
import { Sky } from './sky.js?v=20261024194841';
import { paintWall } from './textures.js?v=20261024194841';
import { terrain, floorY } from './physics.js?v=20261024194841';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.min(1, Math.max(0, x)), lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const backOut = x => { x = clamp01(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
let ENV_I = .5; const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .7, envMapIntensity: ENV_I, ...o });
const geoC = new Map(); const rbox = (w, h, d, r = .06) => { const k = [w, h, d, r].join(); if (!geoC.has(k)) geoC.set(k, new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) * .49))); return geoC.get(k); };
function kit(){ const parts = new Map(); return {
  box(w, h, d, c, x = 0, y = 0, z = 0, o = {}){ const g = rbox(w, h, d, o.r ?? .05).clone(); g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), V(1, 1, 1))); if (!parts.has(c)) parts.set(c, []); parts.get(c).push(g); return this; },
  into(group, o = {}){ for (const [c, l] of parts){ const m = new THREE.Mesh(mergeGeometries(l), mat(c, typeof o === 'function' ? o(c) : o)); m.castShadow = m.receiveShadow = true; group.add(m); } parts.clear(); return group; } }; }
function stripeTex(){ const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; const g = cv.getContext('2d'); g.fillStyle = '#ffcf1f'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#1b1b1f'; for (let x = -32; x < 256; x += 32){ g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

// a box whose texture coordinates come from where it sits in the world, so separate pieces line up seamlessly
function worldBox(w, h, d, cx, cy, S = 4){ const g = new THREE.BoxGeometry(w, h, d), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++){ const x = p.getX(i) + cx, y = p.getY(i) + cy, z = p.getZ(i); if (Math.abs(n.getZ(i)) > .5) uv.setXY(i, x / S, y / S); else if (Math.abs(n.getX(i)) > .5) uv.setXY(i, z / S, y / S); else uv.setXY(i, x / S, z / S); }
  return g; }
const RNG = s => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };

export class Diorama {
  constructor(canvas, theme){
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(36, 9 / 16, 2, 400);
    scene.fog = new THREE.Fog('#8fa8ff', 35, 110); this.hemi = new THREE.HemisphereLight('#eef2ff', '#6a5a7a', 1.3); scene.add(this.hemi); this.pm = new THREE.PMREMGenerator(r);
    const sun = this.sun = new THREE.DirectionalLight('#fff4e0', 2.8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .05; scene.add(sun, sun.target);
    this.levelG = new THREE.Group(); scene.add(this.levelG);
    this.inkM = mat('#141414', { roughness: .35 }); this.inkG = new THREE.Group(); scene.add(this.inkG); this.inkSegs = [];
    this.cyl = new THREE.CylinderGeometry(.09, .09, 1, 10); this.cap = new THREE.SphereGeometry(.09, 10, 8);
    this.sky = new Sky(scene); this.buildPen(); this.buildConfetti();
    this.plane = new THREE.Plane(V(0, 0, 1), 0); this.ray = new THREE.Raycaster();
    this.buildFx(); this.buildDebris();
    this.camState = null; if (theme) this.setTheme(theme);
  }
  size(w, h, pr = Math.min(window.devicePixelRatio || 1, 2)){ this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.W = w; this.H = h; }
  // ---------------- world pieces
  buildCar(C){ if (this.car){ this.scene.remove(this.car.g); this.car.wheels.forEach(w => this.scene.remove(w)); }
    if (this.car) this.scene.remove(this.car.cab);
    const g = new THREE.Group(), body = new THREE.Group(), cab = new THREE.Group(), cabBody = new THREE.Group(); g.add(body); cab.add(cabBody); const kc = kit(), ku = kit(), B = C.body, Gl = C.glass, T = C.trim;
    const k = { box(w, h, d, c, x = 0, y = 0, z = 0, o = {}){ (y > .18 ? ku : kc).box(w, h, d, c, x, y, z, o); return k; } };
    const glass = (w, h, x, y, rz) => { k.box(.04, h, .9, Gl, x, y, 0, { r: .02, rz }); };
    const side = (w, h, x, y) => { k.box(w, h, .02, Gl, x, y, .505, { r: .02 }).box(w, h, .02, Gl, x, y, -.505, { r: .02 }); };
    if (C.shape === 'sport'){ k.box(2.05, .36, 1.1, B, 0, -.08, 0, { r: .16 }).box(.95, .3, .96, B, -.2, .24, 0, { r: .14 }); glass(0, .3, .3, .25, -.9); glass(0, .26, -.68, .24, .7); side(.7, .2, -.2, .27);
      k.box(.06, .22, .06, T, -.88, .2, .35).box(.06, .22, .06, T, -.88, .2, -.35).box(.3, .05, 1.1, T, -.9, .32, 0, { r: .02 }).box(2.0, .02, .18, T, 0, .11, 0, { r: .01 }); }
    else if (C.shape === 'jeep'){ k.box(1.9, .55, 1.12, B, 0, 0, 0, { r: .08 }).box(1.0, .48, 1.04, B, -.25, .5, 0, { r: .06 }); glass(0, .38, .27, .5, -.15); side(.75, .3, -.25, .52);
      k.box(.9, .05, .05, T, -.25, .78, .42).box(.9, .05, .05, T, -.25, .78, -.42).box(.05, .05, .9, T, .1, .78, 0).box(.05, .05, .9, T, -.6, .78, 0).box(.1, .5, .5, '#1d1d22', -1.0, .12, 0, { r: .08 }).box(.08, .3, 1.0, T, 1.0, -.1, 0, { r: .03 }); }
    else if (C.shape === 'van'){ k.box(1.95, .5, 1.1, B, 0, -.02, 0, { r: .14 }).box(1.55, .55, 1.06, B, -.18, .48, 0, { r: .14 }); glass(0, .4, .6, .48, -.45); side(1.1, .26, -.3, .55); k.box(1.96, .06, 1.12, T, 0, .2, 0, { r: .02 }); }
    else if (C.shape === 'buggy'){ k.box(1.85, .3, 1.0, B, 0, -.08, 0, { r: .12 }).box(.35, .3, .5, T, -.25, .2, 0, { r: .08 });
      for (const z of [-.45, .45]){ k.box(.06, .62, .06, T, .25, .35, z, { r: .02, rz: -.25 }).box(.06, .6, .06, T, -.65, .36, z, { r: .02 }).box(.86, .06, .06, T, -.24, .66, z, { r: .02 }); } k.box(.06, .06, .96, T, .17, .66, 0, { r: .02 }).box(.06, .06, .96, T, -.65, .66, 0, { r: .02 }); }
    else { k.box(1.9, .5, 1.1, B, 0, -.02, 0, { r: .18 }).box(1.1, .45, 1.0, B, -.12, .42, 0, { r: .16 }); glass(0, .36, .44, .42, -.35); glass(0, .34, -.68, .42, .3); side(.8, .3, -.12, .44); }
    k.box(.08, .14, .26, '#fff7d1', .96, .04, .32, { r: .03 }).box(.08, .14, .26, '#fff7d1', .96, .04, -.32, { r: .03 }).box(.06, .12, .2, '#e5452f', -.96, .06, .34, { r: .02 }).box(.06, .12, .2, '#e5452f', -.96, .06, -.34, { r: .02 }).box(1.92, .12, 1.12, '#333333', 0, -.24, 0, { r: .05 });
    const look = c => c === B ? { roughness: C.rough ?? .45, metalness: C.metal ?? 0 } : c === Gl ? { roughness: .08, metalness: .2 } : c === T ? { roughness: .4, metalness: .3, ...(C.glow ? { emissive: C.glow, emissiveIntensity: 3.5 } : {}) } : c === '#fff7d1' ? { emissive: '#fff2b0', emissiveIntensity: C.glow ? 1.5 : .2 } : { roughness: .5 }; kc.into(body, look); ku.into(cabBody, look);
    const wheels = [0, 1].map(() => { const w = new THREE.Group(); for (const z of [-.5, .5]){ const t = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .22, 24), mat('#1d1d22', { roughness: .8 })); t.rotation.x = Math.PI / 2; t.position.z = z; t.castShadow = true; w.add(t); const h = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .24, 16), mat(C.hub || '#f2f2f2', { roughness: .35, metalness: .3 })); h.rotation.x = Math.PI / 2; h.position.z = z; w.add(h); const sp = new THREE.Mesh(rbox(.26, .05, .25, .01), mat('#9aa0a8')); sp.position.z = z; w.add(sp); } this.scene.add(w); return w; });
    this.scene.add(g, cab); this.car = { g, body, cab, cabBody, wheels, charred: false }; }
  resetCar(){ if (this.car?.charred) this.buildCar(this.theme.car); }
  charCar(){ if (this.car.charred) return; this.car.charred = true; for (const o of [this.car.g, this.car.cab, ...this.car.wheels]) o.traverse(m => { if (m.material){ m.material = m.material.clone(); m.material.color.multiplyScalar(.18); m.material.emissiveIntensity = 0; m.material.roughness = .95; } }); }
  setTheme(T){ this.theme = T; ENV_I = T.env ?? .5; const r = this.renderer;
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512; const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, T.sky[0]); gr.addColorStop(.55, T.sky[1]); gr.addColorStop(1, T.sky[2]); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    this.sky.setTheme(T);
    const eq = new THREE.CanvasTexture(cv); eq.colorSpace = THREE.SRGBColorSpace; eq.mapping = THREE.EquirectangularReflectionMapping; if (this.env) this.env.dispose(); this.env = this.pm.fromEquirectangular(eq).texture; eq.dispose(); this.scene.environment = this.env;
     this.hemi.color.set(T.hemi[0]); this.hemi.groundColor.set(T.hemi[1]); this.hemi.intensity = T.hemi[2]; this.sun.color.set(T.sun[0]); this.sun.intensity = T.sun[1]; r.toneMappingExposure = T.exposure ?? 1.05; this.scene.fog.color.copy(this.sky.fogColor());
    this.inkM.color.set(T.ink); this.inkM.emissive.set(T.inkGlow ? T.ink : '#000000'); this.inkM.emissiveIntensity = T.inkGlow ? 3 : 0;
    this.buildCar(T.car); if (this.level) this.setLevel(this.level); }
  wallMat(rx, ry){ const W = this.theme.wall, p = paintWall(this.theme), tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; };
    return mat(W.tint || '#ffffff', { map: tex(p.map), roughness: W.rough ?? .8, metalness: W.metal ?? 0, ...(p.emissive ? { emissiveMap: tex(p.emissive), emissive: '#ffffff', emissiveIntensity: 3 } : {}) }); }
  buildPen(){ const p = this.pen = new THREE.Group(), k = kit(); k.box(.22, 1.5, .22, '#1c1c22', 0, .95, 0, { r: .1 }).box(.24, .36, .24, '#ffcf1f', 0, 1.5, 0, { r: .1 }).box(.12, .25, .12, '#111', 0, .12, 0, { r: .04 }); k.into(p); p.rotation.z = -.35; p.rotation.x = .25; p.visible = false; this.scene.add(p); }
  buildConfetti(){ this.CONF = Array.from({ length: 120 }, (_, i) => ({ vx: Math.cos(i * 2.4) * (1 + i % 5 * .5), vz: Math.sin(i * 2.4) * (1 + i % 4 * .4), vy: 7 + (i % 7) * .9, rot: i, col: ['#ffcf1f', '#ff5a5a', '#46d38a', '#5aa0ff', '#ff7ae0', '#ffffff'][i % 6] }));
    const c = this.conf = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, .02, .1), mat('#fff'), this.CONF.length); this.CONF.forEach((q, i) => c.setColorAt(i, new THREE.Color(q.col))); c.count = 0; this.scene.add(c); this.o3 = new THREE.Object3D(); }
  buildDebris(){ this.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat('#888', { roughness: .9, flatShading: true }), 200); this.rocks.castShadow = true; this.rocks.count = 0;
    this.panels = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 1), mat('#888', { roughness: .5, metalness: .3 }), 40); this.panels.castShadow = true; this.panels.count = 0; this.scene.add(this.rocks, this.panels); }
  buildFx(){ const geo = new THREE.IcosahedronGeometry(1, 0);
    this.glow = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), 900); this.glow.count = 0;
    this.smokeM = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: .82, depthWrite: false }), 900); this.smokeM.count = 0;
    const hc = document.createElement('canvas'); hc.width = hc.height = 128; const hg = hc.getContext('2d'), gr = hg.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); hg.fillStyle = gr; hg.fillRect(0, 0, 128, 128);
    this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), 1000); this.halo.count = 0; this.halo.renderOrder = 5;
    this.glow.frustumCulled = this.smokeM.frustumCulled = this.halo.frustumCulled = false; this.scene.add(this.glow, this.smokeM, this.halo);
    this.flash = new THREE.PointLight('#ffb060', 0, 16, 1.5); this.scene.add(this.flash); this.parts = []; this.rng = RNG(99); this.fxT = null; this.col = new THREE.Color(); }
  // particle helpers: kind 0 = glowing (fire, sparks), 1 = smoke/dust
  emit(n, f){ for (let i = 0; i < n && this.parts.length < 1700; i++){ const r = this.rng, p = f(r); p.age = 0; this.parts.push(p); } }
  fire(x, y, n, big = 1){ this.emit(n, r => ({ k: 0, fire: true, x: x + (r() - .5) * .5 * big, y: y + (r() - .3) * .3 * big, z: (r() - .5) * .6 * big, vx: (r() - .5) * .8, vy: 1.2 + r() * 2.2 * big, vz: (r() - .5) * .6, g: -1, life: .45 + r() * .5, s: (.12 + r() * .16) * big })); }
  smoke(x, y, n, c = .25, big = 1){ this.emit(n, r => ({ k: 1, x: x + (r() - .5) * .4, y, z: (r() - .5) * .6, vx: (r() - .5) * .6 + .25, vy: .7 + r() * 1.2, vz: (r() - .5) * .4, g: -.3, life: 1.6 + r() * 1.6, s: (.16 + r() * .2) * big, grow: 2.6, c: c + r() * .08 })); }
  sparks(x, y, n, sp = 7){ this.emit(n, r => { const a = r() * Math.PI * 2, v = sp * (.3 + r()); return { k: 0, x, y, z: (r() - .5) * .3, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, vz: (r() - .5) * 3, g: 14, life: .3 + r() * .5, s: .035 + r() * .03, spark: true }; }); }
  dust(x, y, n, big = 1){ const c = new THREE.Color(this.theme.cap.color).lerp(new THREE.Color('#9a8d80'), .5); this.emit(n, r => ({ k: 1, x: x + (r() - .5) * .8, y: y + (r() - .5) * .4, z: (r() - .5) * 2.5, vx: (r() - .5) * 2.4 * big, vy: r() * 1.6 * big, vz: (r() - .5) * 1.5, g: 1.2, life: .9 + r() * 1.2, s: (.12 + r() * .18) * big, grow: 2.2, rgb: c })); }
  boom(x, y){ this.flashT = 0; this.flash.position.set(x, y + .6, 2.2); this.fire(x, y + .2, 70, 2.6); this.sparks(x, y, 70, 11); this.smoke(x, y + .5, 45, .12, 2.4);
    this.emit(30, r => { const a = r() * Math.PI * 2, v = 3 + r() * 5; return { k: 0, fire: true, x, y: y + .3, z: (r() - .5), vx: Math.cos(a) * v, vy: Math.sin(a) * v * .6 + 2, vz: (r() - .5) * 3, g: 2, life: .35 + r() * .35, s: .35 + r() * .3 }; }); }
  // turn simulation events into particles
  fx(evs){ for (const e of evs){ const [k, a, b, c, d, f] = e;
    if (k === 'boom'){ this.boom(a, b); this.charCar(); }
    if (k === 'crumble'){ this.dust(a, b, 10, .8 + c); }
    if (k === 'spark') this.sparks(a, b, 8);
    if (k === 'dent'){ this.sparks(b, c, 5, 5); this.smoke(b, c, 3, .3); }
    if (k === 'snap'){ this.dust(a, b, 4, .5); this.sparks(a, b, 4, 3); }
    if (k === 'partoff'){ this.smoke(a, b, 8, .25); this.sparks(a, b, 10, 6); }
    if (k === 'shot') this.smoke(a, b + .9, 3, .55, .7);
    if (k === 'hit' && (a === 'rock' || b === 'rock' || a === 'stone' && b === 'metal' || a === 'metal' && b === 'stone') && c > 3.5) this.dust(d, f, 2, .6); } }
  stepFx(dt, st){
    // continuous emitters: a hurt car smokes, a dying car burns
    if (st){ const [x, y, a] = st.car, hx = x + Math.cos(a) * .7 - Math.sin(a) * .2, hy = y + Math.sin(a) * .7 + Math.cos(a) * .2;
      if (st.hp < 70 && !st.exploded && this.rng() < dt * (70 - st.hp) / 6) this.smoke(hx, hy, 1, st.hp < 40 ? .12 : .4);
      if (st.fire && !st.exploded) this.fire(hx, hy, Math.ceil(dt * 50));
      if (st.exploded){ const age = st.t - (this.boomAt ??= st.t), rate = Math.max(0, 1 - age / 9); if (this.rng() < rate) this.fire(x, y + .1, Math.ceil(dt * 45 * rate), 1.3); if (this.rng() < dt * 8 * rate) this.smoke(x, y + .6, 1, .08, 1.6); } }
    else this.boomAt = null;
    const P = this.parts; for (let i = P.length - 1; i >= 0; i--){ const p = P[i]; p.age += dt; if (p.age > p.life){ P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (this.floor != null && p.y < this.floor + .05 && p.spark){ p.y = this.floor + .05; p.vy *= -.3; } }
    if (this.flashT != null){ this.flashT += dt; this.flash.intensity = Math.max(0, 900 * Math.exp(-this.flashT * 7)); if (this.flashT > 1.5) this.flashT = null; } else this.flash.intensity = 0;
    const o3 = this.o3, col = this.col, hq = this.camera.quaternion; let ng = 0, ns = 0, nh = 0;
    const halo = (x, y, z, size, r, g, b) => { if (nh >= 1000) return; o3.position.set(x, y, z + .05); o3.quaternion.copy(hq); o3.scale.setScalar(size); o3.updateMatrix(); this.halo.setMatrixAt(nh, o3.matrix); col.setRGB(r, g, b); this.halo.setColorAt(nh++, col); };
    if (this.flashT != null && this.flashT < .9){ const k = Math.exp(-this.flashT * 5); halo(this.flash.position.x, this.flash.position.y, 1, 9 + this.flashT * 8, k, k * .7, k * .4); }
    for (const p of P){ const u = p.age / p.life;
      if (p.k === 0){ const sc = p.spark ? p.s : p.s * (u < .2 ? .5 + u * 2.5 : 1 - (u - .2) / .8 * .8); o3.position.set(p.x, p.y, p.z); o3.quaternion.identity(); o3.rotation.set(p.age * 3, p.age * 2, 0);
        if (p.spark){ const sp = Math.hypot(p.vx, p.vy); o3.scale.set(p.s, p.s + sp * .012, p.s); o3.rotation.set(0, 0, Math.atan2(p.vy, p.vx) - Math.PI / 2); } else o3.scale.setScalar(sc);
        o3.updateMatrix(); this.glow.setMatrixAt(ng, o3.matrix);
        if (p.spark) col.setRGB(6, 3.2, 1.2); else if (u < .25) col.setRGB(7, 5.2, 2.4); else if (u < .6) col.setRGB(5, 1.9, .45); else col.setRGB(1.6 * (1 - u) + .1, .35 * (1 - u), .1 * (1 - u));
        this.glow.setColorAt(ng++, col); if (p.spark) halo(p.x, p.y, p.z, .35, .5, .3, .1); else if (u < .7) halo(p.x, p.y, p.z, sc * 4.5, .22 * (1 - u), .12 * (1 - u), .03); }
      else { const sc = p.s * (1 + u * p.grow) * (u > .75 ? 1 - (u - .75) / .25 : 1); o3.position.set(p.x, p.y, p.z); o3.rotation.set(p.age, p.age * .7, 0); o3.scale.setScalar(Math.max(.001, sc)); o3.updateMatrix(); this.smokeM.setMatrixAt(ns, o3.matrix);
        if (p.rgb) col.copy(p.rgb); else col.setRGB(p.c, p.c, p.c * 1.05); this.smokeM.setColorAt(ns++, col); } }
    this.glow.count = ng; this.smokeM.count = ns; this.halo.count = nh; for (const m of [this.glow, this.smokeM, this.halo]){ m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
  clearFx(){ this.parts.length = 0; this.flashT = null; this.boomAt = null; }
  // the ground fades out toward the horizon so it melts into the sky instead of ending in a hard line
  groundFade(){ if (this._fade) return this._fade; const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#000'); gr.addColorStop(.45, '#000'); gr.addColorStop(.72, '#fff'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256); return this._fade = new THREE.CanvasTexture(c); }
  setLevel(L){
    this.level = L; const G = this.levelG; while (G.children.length) G.remove(G.children[0]);
    const T = this.theme, C = T.cap, wall = this.wallMat(1, 1), capM = mat(C.color, { roughness: C.rough ?? .7, metalness: C.metal ?? 0, ...(C.glow ? { emissive: C.glow, emissiveIntensity: 3 } : {}) });
    const piece = (geo, m, x, y, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
    this.blockMeshes = [];
    for (const t of terrain(L)){
      // Cliff pieces never share a face: the stone under a cap stops exactly where the cap begins, and caps on the open
      // edges stick out a little as a lip. (Stone and cap used to overlap with flush sides, which flickered on phones.)
      const CAP = .34;
      for (const c of t.core){ const x0 = Math.max(c.x0, -45), x1 = Math.min(c.x1, 45), y0 = Math.max(c.y0, t.top - 40), y1 = c.cap ? c.y1 - CAP : c.y1, w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        G.add(piece(worldBox(w, h, 5, cx, cy), wall, cx, cy)); if (c.cap) G.add(piece(new THREE.BoxGeometry(w - .004, CAP, 5.4), capM, cx, t.top - CAP / 2)); }
      for (const b of t.blocks){ const g = new THREE.Group(); g.position.set(b.x, b.y, 0);
        const sh = b.top ? b.h - CAP : b.h, sy = b.top ? -CAP / 2 : 0; g.add(piece(worldBox(b.w, sh, 5, b.x, b.y + sy), wall, 0, sy));
        if (b.top){ const lipL = t.openL && Math.abs(b.x - b.w / 2 - t.x0) < 1e-3 ? .12 : 0, lipR = t.openR && Math.abs(b.x + b.w / 2 - t.x1) < 1e-3 ? .12 : 0;
          g.add(piece(new THREE.BoxGeometry(b.w - .004 + lipL + lipR, CAP, 5.4), capM, (lipR - lipL) / 2, b.h / 2 - CAP / 2)); }
        G.add(g); this.blockMeshes.push(g); } }
    const fy = floorY(L); this.floor = fy;
    if (fy != null){ const gc = new THREE.Color(T.wall.colors[0]).lerp(new THREE.Color('#5d5044'), .55).multiplyScalar(.75), fl = piece(new THREE.PlaneGeometry(500, 220), mat(gc, { roughness: .95, transparent: true, alphaMap: this.groundFade() }), 0, fy, -70); fl.rotation.x = -Math.PI / 2; fl.castShadow = false; G.add(fl);
      const rm = mat(gc.clone().multiplyScalar(.75), { roughness: .9, flatShading: true }), rr = RNG(7);
      for (let i = 0; i < 40; i++){ const r = .2 + rr() * .7, m = piece(new THREE.DodecahedronGeometry(r, 0), rm, (rr() - .5) * 50, fy + r * .3, -10 + rr() * 13); m.rotation.set(rr() * 3, rr() * 3, 0); m.scale.y = .6; G.add(m); } }
    // flag
    const f = new THREE.Group(), k = kit(); k.box(.09, 2.6, .09, '#222', 0, 1.3, 0, { r: .03 }).box(.3, .12, .3, '#222', 0, .06, 0); k.into(f);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .9, 12, 4), mat(this.theme.flag, { side: THREE.DoubleSide, roughness: .8 })); cloth.position.set(.7, 2.1, 0); f.add(cloth); f.position.set(L.flag[0], L.flag[1], 0); G.add(f);
    this.cloth = cloth; this.clothBase = cloth.geometry.attributes.position.array.slice();
    // hazards
    this.hz = (L.hazards || []).map(h => this.buildHazard(h));
    this.clearInk(); this.camState = null;
  }
  buildHazard(h){ const G = this.levelG, steel = mat('#c9ced6', { roughness: .25, metalness: .8 }), dark = mat('#2a2c33', { roughness: .4, metalness: .6 });
    if (h.type === 'spinner'){ const pil = new THREE.Mesh(worldBox(1.3, 40, 1.3, h.x, h.y - 20.4), this.wallMat(1, 1)); pil.position.set(h.x, h.y - 20.4, 0); pil.castShadow = pil.receiveShadow = true; G.add(pil);
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
  clearInk(){ while (this.inkG.children.length) this.inkG.remove(this.inkG.children[0]); this.strokeGs = []; }
  beginStroke(x, y){ const g = new THREE.Group(); this.inkG.add(g); this.strokeGs.push(g); const c = new THREE.Mesh(this.cap, this.inkM); c.position.set(x, y, 0); c.scale.setScalar(1.2); g.add(c); return g; }
  addInkSegment(x0, y0, x1, y1){ const g = this.strokeGs[this.strokeGs.length - 1], L = Math.hypot(x1 - x0, y1 - y0), m = new THREE.Mesh(this.cyl, this.inkM); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2; m.scale.set(1, Math.max(.001, L), 1); m.castShadow = true;
    const c = new THREE.Mesh(this.cap, this.inkM); c.position.set(x1, y1, 0); g.add(m, c); }
  setInk(strokes, upto = Infinity){ this.clearInk(); let acc = 0, tip = null;
    for (const s of strokes){ if (acc >= upto) break; this.beginStroke(s[0][0], s[0][1]); tip = s[0];
      for (let i = 1; i < s.length; i++){ const [x0, y0] = s[i - 1], [x1, y1] = s[i], L = Math.hypot(x1 - x0, y1 - y0); if (acc + L <= upto){ this.addInkSegment(x0, y0, x1, y1); acc += L; tip = s[i]; } else { const k = (upto - acc) / L; const x = lerp(x0, x1, k), y = lerp(y0, y1, k); this.addInkSegment(x0, y0, x, y); acc = upto; tip = [x, y]; break; } } }
    return tip; }
  // pointer -> world point on the drawing plane
  toWorld(px, py){ const r = this.canvas.getBoundingClientRect(), v = new THREE.Vector2((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(v, this.camera); const p = new THREE.Vector3(); return this.ray.ray.intersectPlane(this.plane, p) ? [p.x, p.y] : null; }
  // ---------------- camera
  frameCamera(t, carPos, follow, winPush = 0, runT = 0){
    const [vx, vy, vw, vh] = this.level.view, cam = this.camera, vfov = cam.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
    const dist = Math.max(vw / 2 / Math.tan(hfov / 2), vh / 2 / Math.tan(vfov / 2)) * (this.margin || 1.12);
    let tgt = V(vx, vy, 0);
    if (follow && carPos){ const low = Math.min(...this.level.solids.map(s => s[2])), cp = [Math.min(Math.max(carPos[0], vx - vw * .6), vx + vw * .6), Math.max(carPos[1], (this.floor ?? low - 9) + 3)];
      const off = cp[1] < low - 3 || cp[1] > vy + vh / 2 - 1 || Math.abs(cp[0] - vx) > vw / 2 - 1; tgt = V(lerp(vx, cp[0], off ? .7 : .1), lerp(vy, cp[1], off ? .75 : .08), 0); }
    if (winPush > 0) tgt.lerp(V(this.level.flag[0], this.level.flag[1] + 1, 0), winPush * .2);
    if (!this.camState || t < this.camState.t || t - this.camState.t > .25) this.camState = { tgt: tgt.clone(), t }; else { const k = 1 - Math.exp(-(t - this.camState.t) * 3.2); this.camState.tgt.lerp(tgt, k); this.camState.t = t; }
    // the same angle while drawing and at the start of the run, so the line never seems to jump; a gentle drift once it is going
    const sway = ss(0, 4, runT), c = this.camState.tgt, az = .14 + Math.sin(runT * .23) * .04 * sway, el = .1 + Math.sin(runT * .17) * .02 * sway, d = dist * (1 - winPush * .08);
    cam.position.set(c.x + Math.sin(az) * Math.cos(el) * d, c.y + Math.sin(el) * d, c.z + Math.cos(az) * Math.cos(el) * d); cam.lookAt(c.x, c.y, 0);
    // the sun stays fixed for the whole level: a sun that follows the camera makes shadow edges shimmer
    const [lx, ly] = this.level.view; this.sun.position.set(lx + 10, ly + 20, 18); this.sun.target.position.set(lx, ly - 4, 0); }
  // ---------------- draw one frame from a physics state (or the idle start state)
  render(t, st, opts = {}){
    const L = this.level, dt = this.fxT == null ? 0 : Math.min(.1, Math.max(0, t - this.fxT)); this.fxT = t;
    if (st){ st.ink.forEach((p, i) => { const g = this.strokeGs[i]; if (g){ g.position.set(p[0], p[1], 0); g.rotation.z = p[2]; } });
      this.car.g.position.set(st.car[0], st.car[1] - .02, 0); this.car.g.rotation.z = st.car[2]; this.car.cab.position.set(st.cabin[0], st.cabin[1] - .02, 0); this.car.cab.rotation.z = st.cabin[2];
      this.car.wheels.forEach((w, i) => { w.position.set(st.wheels[i][0], st.wheels[i][1], 0); w.rotation.z = st.wheels[i][2]; });
      st.blocks.forEach((b, i) => { const g = this.blockMeshes[i]; if (b && g){ g.position.set(b[0], b[1], 0); g.rotation.z = b[2]; } }); }
    else { this.strokeGs.forEach(g => { g.position.set(0, 0, 0); g.rotation.z = 0; }); for (const o of [this.car.g, this.car.cab]){ o.position.set(L.car[0], L.car[1] - .02, 0); o.rotation.z = 0; } this.car.wheels.forEach((w, i) => { w.position.set(L.car[0] + (i ? .55 : -.55), L.car[1] - .37, 0); w.rotation.z = 0; });
      terrain(L).flatMap(t => t.blocks).forEach((b, i) => { const g = this.blockMeshes[i]; if (g){ g.position.set(b.x, b.y, 0); g.rotation.z = 0; } }); }
    this.car.body.position.y = this.car.cabBody.position.y = st ? 0 : Math.sin(t * 30) * .01;
    const o3 = this.o3; let nr = 0, np = 0;
    if (st) for (const d of st.debris){ o3.position.set(d[0], d[1], 0); o3.rotation.set(0, 0, d[2]);
      if (d[3] === 1){ o3.scale.set(d[4], d[4], d[4] * 1.4); o3.updateMatrix(); this.rocks.setMatrixAt(nr++, o3.matrix); } else { o3.scale.set(d[4], d[5], .3); o3.updateMatrix(); this.panels.setMatrixAt(np++, o3.matrix); } }
    this.rocks.count = nr; this.panels.count = np; this.rocks.instanceMatrix.needsUpdate = this.panels.instanceMatrix.needsUpdate = true;
    this.rocks.material.color.set(this.theme.wall.colors[0]); this.panels.material.color.set(this.car.charred ? '#2a2522' : this.theme.car.body);
    if (opts.events) this.fx(opts.events); this.stepFx(dt, st);
    for (let i = 0; i < this.cloth.geometry.attributes.position.count; i++){ const x = this.clothBase[i * 3] + .65; this.cloth.geometry.attributes.position.setZ(i, Math.sin(x * 4 - t * 6) * .12 * x); } this.cloth.geometry.attributes.position.needsUpdate = true;
    const simT = st ? st.t : 0;
    this.hz.forEach((o, i) => { const h = o.h, hs = st && st.hazards[i];
      if (h.type === 'spinner'){ o.s.rotation.z = hs ? hs.spin : 0; let n = 0; if (hs) for (const b of hs.bullets){ if (b[3] > 3.2) continue; o3.position.set(b[0], b[1], 0); o3.rotation.set(0, 0, b[2]); o3.scale.setScalar(1); o3.updateMatrix(); o.bul.setMatrixAt(n++, o3.matrix); } o.bul.count = n; o.bul.instanceMatrix.needsUpdate = true; }
      if (h.type === 'saw'){ if (hs){ o.s.position.set(hs.pos[0], hs.pos[1], 0); o.s.rotation.z = hs.pos[2]; } else { o.s.position.set(h.path[0][0], h.path[0][1], 0); o.s.rotation.z = 0; } }
      if (h.type === 'fan'){ o.blades.rotation.y = t * 14; for (let k = 0; k < 40; k++){ const u = ((t * 1.3 + k * .137) % 1), sx = ((k * 7919) % 100) / 100 - .5; o3.position.set(h.x + sx * h.width * .9, h.y + .4 + u * h.length, ((k * 31) % 10) / 10 - .5); o3.rotation.set(0, 0, 0); o3.scale.set(1, .5 + (1 - u), 1); o3.updateMatrix(); o.wind.setMatrixAt(k, o3.matrix); } o.wind.instanceMatrix.needsUpdate = true; } });
    if (opts.winAt != null && simT > opts.winAt){ const q = simT - opts.winAt; this.conf.count = this.CONF.length; this.CONF.forEach((c, i) => { o3.position.set(L.flag[0] - .4 + c.vx * q, L.flag[1] + 2.4 + c.vy * q - 5 * q * q, c.vz * q); o3.rotation.set(c.rot + q * 5, c.rot + q * 3, 0); o3.scale.setScalar(1); o3.updateMatrix(); this.conf.setMatrixAt(i, o3.matrix); }); this.conf.instanceMatrix.needsUpdate = true; } else this.conf.count = 0;
    this.frameCamera(t, st ? st.car : null, !!st, opts.winAt != null && simT > opts.winAt ? ss(opts.winAt, opts.winAt + 1.2, simT) : 0, simT);
    if (opts.shake){ this.camera.position.x += Math.sin(t * 91) * opts.shake; this.camera.position.y += Math.cos(t * 77) * opts.shake; }
    this.sky.update(t, this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
