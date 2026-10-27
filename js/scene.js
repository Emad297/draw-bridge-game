// The 3D view: a backrooms corridor (yellow wallpaper, damp carpet, humming lights), the modular car (one mesh per
// physics piece, so every split-off half shows up), the traps, sparks, smoke, fire, oil stains and debris — plus the follow camera.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor-rbox.js?v=20261027024250';
import { createSim, TYPES, PROPS, PIT_Y, pitAt } from './physics.js?v=20261027024250';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t, clamp01 = x => Math.min(1, Math.max(0, x));
const RNG = s => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
// camera viewing angle (radians): azimuth around the vertical axis (negative = from behind the character) and elevation
export const VIEW_AZ = -1.3, VIEW_EL = .62;
const WALL_Z = -3.2, ROOM_Z = 14;      // the yellow wall behind the path, and how far the room reaches towards the camera side
const OIL = ['#120d08', '#1c140c', '#0c0a08'];

// ---------------- painted textures
function canvasTex(w, h, paint, srgb = true){ const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h, RNG(w * 7 + h)); const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
const speckle = (g, w, h, r, n, cols, a) => { for (let i = 0; i < n; i++){ g.globalAlpha = a * r(); g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } g.globalAlpha = 1; };
const stains = (g, w, h, r, n, col) => { for (let i = 0; i < n; i++){ const x = r() * w, y = r() * h, s = 20 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, col + '55'); gr.addColorStop(.7, col + '22'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, s, s * (.6 + r()), r() * 3, 0, 7); g.fill(); } };
const wallpaper = () => canvasTex(512, 512, (g, w, h, r) => { g.fillStyle = '#cdb86a'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32){ g.fillStyle = 'rgba(255,240,170,.22)'; g.fillRect(x, 0, 10, h); g.fillStyle = 'rgba(120,95,30,.10)'; g.fillRect(x + 22, 0, 2, h); }
  g.strokeStyle = 'rgba(130,100,35,.18)'; g.lineWidth = 2; for (let y = 16; y < h; y += 48) for (let x = 16; x < w; x += 64){ const yy = y + (x / 64 % 2) * 24; g.beginPath(); g.moveTo(x, yy - 7); g.lineTo(x + 6, yy); g.lineTo(x, yy + 7); g.lineTo(x - 6, yy); g.closePath(); g.stroke(); }
  speckle(g, w, h, r, 6000, ['#a8914a', '#e8d68a'], .35); stains(g, w, h, r, 6, '#7a5a1a'); });
const carpet = () => canvasTex(512, 512, (g, w, h, r) => { g.fillStyle = '#b09a5c'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 30000, ['#9a8448', '#c4ae6e', '#8a763e', '#d0bb7c'], .5); stains(g, w, h, r, 7, '#5a4a1c'); });
const concrete = () => canvasTex(256, 256, (g, w, h, r) => { g.fillStyle = '#8f8a78'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 9000, ['#6f6a5a', '#a8a290', '#7c7766'], .5); stains(g, w, h, r, 4, '#3a352a'); });
const ceilTile = () => canvasTex(256, 256, (g, w, h, r) => { g.fillStyle = '#d9d2b4'; g.fillRect(0, 0, w, h); speckle(g, w, h, r, 5000, ['#bdb698', '#ece6c8'], .5); g.strokeStyle = '#a69e7c'; g.lineWidth = 6; g.strokeRect(0, 0, w, h); stains(g, w, h, r, 2, '#8a6a2a'); });
const stripes = () => canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#1d1d1d'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c21b'; for (let x = -64; x < w + 64; x += 64){ g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.closePath(); g.fill(); } });
// a blood stain: an irregular wet blob with droplets flung around it (white, tinted per stain)
const splatTex = () => canvasTex(256, 256, (g, w, h, r) => { g.fillStyle = '#fff';
  for (let i = 0; i < 9; i++){ const a = r() * 6.28, d = r() * 34, s = 28 + r() * 34; g.beginPath(); g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, s, s * (.6 + r() * .4), r() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 26; i++){ const a = r() * 6.28, d = 70 + r() * 50, s = 2 + r() * 7; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, s, 0, 7); g.fill(); } });
const barrelTex = () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#c0281d'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a1c14'; for (const y of [18, 108]) g.fillRect(0, y, w, 6); g.fillStyle = '#f2c21b'; g.fillRect(0, 50, w, 28); g.fillStyle = '#1d1d1d'; g.font = '900 22px sans-serif'; g.textAlign = 'center'; g.fillText('DANGER', w / 2, 72); });
const exitSign = () => canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#0b1a0d'; g.fillRect(0, 0, w, h); g.fillStyle = '#5dff7a'; g.font = '900 70px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 4); });

// a box from (x0,y0,z0) to (x1,y1,z1) whose texture is laid out in world units, so neighbouring boxes line up
function wbox(x0, x1, y0, y1, z0, z1, m, s = 2){ const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (Math.abs(n.getY(i)) > .5) uv.setXY(i, x / s, z / s); else if (Math.abs(n.getX(i)) > .5) uv.setXY(i, z / s, y / s); else uv.setXY(i, x / s, y / s); }
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; return mesh; }

// ---------------- particles: blood drops, dust, sparks — round soft points sized in world units
const P_VS = `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * scale / -mv.z; vC = color; vA = alpha; }`;
const P_FS = `varying vec3 vC; varying float vA; uniform float soft;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vC, vA * mix(1.0 - smoothstep(0.75, 1.0, r), 1.0 - r, soft));
  #include <colorspace_fragment>
}`;
class Points {
  constructor(scene, n, soft, blending = THREE.NormalBlending){ this.n = n; this.list = []; const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { scale: { value: 800 }, soft: { value: soft } }, vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false, blending });
    this.obj = new THREE.Points(g, this.mat); this.obj.frustumCulled = false; scene.add(this.obj); this.g = g; }
  add(p){ if (this.list.length >= this.n) this.list.shift(); p.c = new THREE.Color(p.col); p.t = 0; this.list.push(p); }
  upload(){ const L = this.list; for (let i = 0; i < L.length; i++){ const p = L[i]; this.pos.set([p.x, p.y, p.z], i * 3); this.col.set([p.c.r, p.c.g, p.c.b], i * 3); this.size[i] = p.s; this.alpha[i] = p.a; }
    this.g.setDrawRange(0, L.length); for (const k of ['position', 'color', 'size', 'alpha']) this.g.attributes[k].needsUpdate = true; }
}

export class View {
  constructor(canvas, L){
    this.canvas = canvas; this.L = L;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(20, 9 / 16, 4, 300);
    scene.background = new THREE.Color('#c9b878'); scene.fog = new THREE.Fog('#c9b878', 26, 70);
    this.hemi = new THREE.HemisphereLight('#fff4c8', '#6a5a28', 1.5); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff3cf', 1.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .04; scene.add(sun, sun.target);
    this.flash = new THREE.PointLight('#ffb050', 0, 14, 1.6); scene.add(this.flash);
    this.o3 = new THREE.Object3D();
    this.buildRoom(); this.buildCar(); this.buildTraps(); this.buildFx();
    this.reset();
  }
  size(w, h, pr = Math.min(window.devicePixelRatio || 1, 2)){ this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.W = w; this.H = h; this.fitC = null; }

  // ---------------- the room
  buildRoom(){ const L = this.L, G = this.room = new THREE.Group(), [X0, X1] = L.length, H = L.ceil;
    const M = this.M = { wall: new THREE.MeshStandardMaterial({ map: wallpaper(), roughness: .9 }), carpet: new THREE.MeshStandardMaterial({ map: carpet(), roughness: 1 }), conc: new THREE.MeshStandardMaterial({ map: concrete(), roughness: .95 }),
      ceil: new THREE.MeshStandardMaterial({ map: ceilTile(), roughness: .9 }), light: new THREE.MeshBasicMaterial({ color: '#fffbe6', toneMapped: false }), lightOff: new THREE.MeshStandardMaterial({ color: '#8d8a7a', roughness: .6 }),
      trim: new THREE.MeshStandardMaterial({ color: '#8c7438', roughness: .8 }), steel: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: .25, metalness: .8 }), dark: new THREE.MeshStandardMaterial({ color: '#2a2c33', roughness: .45, metalness: .6 }) };
    const floorMats = [M.conc, M.conc, M.carpet, M.conc, M.conc, M.conc];
    // floor: solid ground with trenches cut right across the room
    let x = X0 - 1; for (const p of [...L.pits].sort((a, b) => a.x0 - b.x0).concat([{ x0: X1 + 1, x1: X1 + 1 }])){ if (p.x0 > x) G.add(wbox(x, p.x0, -4.2, 0, WALL_Z - .4, ROOM_Z, floorMats)); x = p.x1; }
    for (const p of L.pits) G.add(wbox(p.x0, p.x1, -4.2, PIT_Y, WALL_Z - .4, ROOM_Z, M.conc));
    // the wall behind the path (it goes down into the trenches too), its skirting and a strip of ceiling with lights
    G.add(wbox(X0 - 1, X1 + 1, -4.2, H, WALL_Z - .3, WALL_Z, M.wall)); G.add(wbox(X0 - 1, X1 + 1, 0, .12, WALL_Z, WALL_Z + .03, M.trim));
    G.add(wbox(X0 - 1, X1 + 1, H - .12, H, WALL_Z, WALL_Z + .05, M.trim));
    this.lights = []; for (let lx = X0 + 1; lx < X1; lx += 3){ const m = wbox(lx - .7, lx + .7, H - .5, H - .3, WALL_Z, WALL_Z + .12, M.light); m.castShadow = false; G.add(m); this.lights.push({ m, k: this.lights.length }); }
    // end walls; at the exit end a doorway with a glowing sign and white light beyond
    G.add(wbox(X0 - 1, X0, 0, H, WALL_Z, ROOM_Z, M.wall));
    const ex = L.exit + 1; G.add(wbox(ex, ex + .25, 0, H, WALL_Z, -1.1, M.wall), wbox(ex, ex + .25, 0, H, 1.1, ROOM_Z, M.wall), wbox(ex, ex + .25, 2.4, H, -1.1, 1.1, M.wall));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(.9, .34), new THREE.MeshBasicMaterial({ map: exitSign(), toneMapped: false })); sign.position.set(ex - .02, 2.75, 0); sign.rotation.y = -Math.PI / 2; G.add(sign);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })); glow.position.set(ex + 1.5, 1.2, 0); glow.rotation.y = -Math.PI / 2; G.add(glow);
    // the rest of the room: partition walls and pillars, the endless-maze feeling (kept off the path and the trenches)
    const r = RNG(99), clearOf = (a, b) => !L.pits.some(p => b > p.x0 - .5 && a < p.x1 + .5) && !(b > L.exit - 2 && a < L.exit + 2);
    for (let px = X0 + 2; px < X1 - 2; px += 4 + r() * 4){ const z = 4.5 + r() * 7, len = 2 + r() * 5;
      if (r() < .55){ if (clearOf(px, px + len)) G.add(wbox(px, px + len, 0, H, z, z + .2, M.wall)); } else if (clearOf(px, px + .6)) G.add(wbox(px, px + .6, 0, H, z, z + .6, M.wall)); }
    this.scene.add(G); }

  // ---------------- the car: every physics piece gets its own mesh, made on demand (so the halves of a sawn piece appear too)
  buildCar(){ const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
    this.paint = std('#d8331f', { roughness: .32, metalness: .35 });
    this.CM = { glass: std('#9fc3d6', { roughness: .05, metalness: .2, transparent: true, opacity: .4 }), chrome: std('#d9dde3', { roughness: .15, metalness: 1 }), rubber: std('#151515', { roughness: .85 }),
      frame: std('#2b2d31', { roughness: .55, metalness: .6 }), engine: std('#4a4d55', { roughness: .35, metalness: .85 }), red: std('#a01d12', { roughness: .4 }), seat: std('#3a2e28', { roughness: .9 }), tank: std('#5a5a5a', { roughness: .5, metalness: .6 }),
      light: new THREE.MeshBasicMaterial({ color: '#fff6d0', toneMapped: false }), tail: new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }), burnt: new THREE.Color('#231e1a') };
    this.geo = new Map(); this.carMeshes = new Map();
    this.wheelG = [0, 1].map(() => { const g = new THREE.Group(); for (const z of [-.78, .78]){ const t = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .26, 28), this.CM.rubber), rim = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .28, 16), this.CM.chrome), sp = new THREE.Mesh(new THREE.BoxGeometry(1.1, .18, .3), this.CM.frame);
        for (const m of [t, rim]){ m.rotation.x = Math.PI / 2; m.position.z = z; m.castShadow = true; } sp.position.z = z; g.add(t, rim, sp); } this.scene.add(g); return g; }); }
  box(w, h, d, r = .25){ const k = [w, h, d].map(v => v.toFixed(2)).join(); if (!this.geo.has(k)) this.geo.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * r)); return this.geo.get(k); }
  pieceMesh(type, w, h, name){ const g = new THREE.Group(), C = this.CM, add = (m, x, y, z, d) => { const o = new THREE.Mesh(this.box(w * (x || 1), h * (y || 1), d), m); o.position.z = z || 0; o.castShadow = o.receiveShadow = true; g.add(o); return o; }, paint = this.paint.clone();
    g.userData.paint = paint;
    if (type === 'frame'){ add(C.frame, 1, 1, 0, 1.5); if (w > .6 && (name === 'fr1' || name === 'fr2')) for (const z of [-.42, .42]){ const s = new THREE.Mesh(this.box(.42, .14, .46), C.seat); s.position.set(.05, h / 2 + .1, z); const b = new THREE.Mesh(this.box(.12, .5, .46), C.seat); b.position.set(-.18, h / 2 + .38, z); b.rotation.z = .2; g.add(s, b); } }
    else if (type === 'engine'){ add(C.engine, 1, 1, 0, .95); for (const z of [-.25, 0, .25]){ const c = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .12, 10), C.red); c.position.set(0, h / 2 + .05, z); g.add(c); } }
    else if (type === 'panel'){ add(paint, 1, 1, -.82, .06); add(paint, 1, 1, .82, .06); }
    else if (type === 'top') add(paint, 1, 1, 0, 1.68);
    else if (type === 'bumper') add(C.chrome, 1, 1, 0, 1.74);
    else if (type === 'pillar'){ add(paint, 1, 1, -.8, .08); add(paint, 1, 1, .8, .08); }
    else if (type === 'glass') add(C.glass, 1, 1, 0, 1.56).castShadow = false;
    else if (type === 'side'){ add(C.glass, 1, 1, -.81, .03).castShadow = false; add(C.glass, 1, 1, .81, .03).castShadow = false; }
    else if (type === 'tank') add(C.tank, 1, 1, 0, .8);
    else if (type === 'light'){ const m = name === 'lightR' ? C.tail : C.light; add(m, 1, 1, -.6, .24); add(m, 1, 1, .6, .24); }
    this.scene.add(g); return g; }

  // ---------------- traps
  buildTraps(){ const L = this.L, M = this.M, G = this.room;
    this.hz = L.hazards.map(h => {
      if (h.type === 'crusher'){ const g = new THREE.Group(), sm = new THREE.MeshStandardMaterial({ map: stripes(), roughness: .5, metalness: .3 }), mats = [M.dark, M.dark, M.dark, M.dark, sm, M.dark];
        const b = wbox(-h.w / 2, h.w / 2, -.6, .6, -1.5, 1.5, mats, .8); g.add(b);
        for (const z of [-.9, .9]){ const rod = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 6, 12), M.steel); rod.position.set(0, 3.6, z); rod.castShadow = true; g.add(rod); }
        this.scene.add(g); return { h, g, blood: 0 }; }
      if (h.type === 'saw'){ const s = new THREE.Group(), disc = new THREE.Mesh(new THREE.CylinderGeometry(h.r * .85, h.r * .85, .06, 40), M.steel); disc.rotation.x = Math.PI / 2; s.add(disc);
        for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, t = new THREE.Mesh(new THREE.ConeGeometry(.12, .34, 4), M.steel); t.position.set(Math.cos(a) * h.r * .95, Math.sin(a) * h.r * .95, 0); t.rotation.z = a - Math.PI / 2 - .4; s.add(t); }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .14, 20), new THREE.MeshStandardMaterial({ color: '#c0281d' })); hub.rotation.x = Math.PI / 2; s.add(hub); s.traverse(o => o.castShadow = true); this.scene.add(s);
        const [a, b] = h.path, vert = Math.abs(b[0] - a[0]) < .01;
        if (vert){ G.add(wbox(a[0] - .06, a[0] + .06, 0, L.ceil, -1.25, -1.15, M.dark)); const arm = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.2, 8), M.steel); arm.rotation.x = Math.PI / 2; arm.position.z = -.6; s.add(arm); } else G.add(wbox(Math.min(a[0], b[0]) - h.r, Math.max(a[0], b[0]) + h.r, -.02, .005, -.06, .06, M.dark));
        return { h, s }; }
      if (h.type === 'ball'){ const g = new THREE.Group(), ball = new THREE.Mesh(new THREE.SphereGeometry(.55, 24, 16), M.dark); ball.castShadow = true; g.add(ball);
        for (let k = 0; k < 8; k++){ const sp = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 8), M.steel), a = k / 8 * Math.PI * 2; sp.position.set(Math.cos(a) * .6, Math.sin(a) * .6, 0); sp.rotation.z = a - Math.PI / 2; ball.add(sp); }
        for (const z of [-.4, .4]){ const sp = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 8), M.steel); sp.position.z = z * 1.5; sp.rotation.x = z > 0 ? Math.PI / 2 : -Math.PI / 2; ball.add(sp); }
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1, 6), M.steel); g.add(chain); const mount = new THREE.Mesh(new THREE.BoxGeometry(.6, .2, .6), M.dark); mount.position.set(h.x, L.ceil - .1, 0); G.add(mount);
        this.scene.add(g); return { h, g, ball, chain }; }
      if (h.type === 'flame'){ const n = wbox(h.x - .35, h.x + .35, -.02, .08, -.9, .9, M.dark); G.add(n); for (const z of [-.5, 0, .5]){ const c = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .12, 12), M.steel); c.position.set(h.x, .1, z); G.add(c); } return { h }; }
      if (h.type === 'mine'){ const g = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .08, 20), M.dark); base.position.y = .04; base.castShadow = true; g.add(base);
        const led = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false })); led.position.y = .1; g.add(led); g.position.set(h.x, 0, 0); this.scene.add(g); return { h, g, led }; }
      return { h }; });
    // spikes fill the bottom of every trench across the path
    const spikes = []; for (const p of L.pits) for (let sx = p.x0 + .25; sx < p.x1 - .1; sx += .45) for (let z = WALL_Z + .3; z <= 1.81; z += .4) spikes.push([sx + (z * 7 % .2), z]);
    const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(.13, .55, 10), M.steel, spikes.length); spikes.forEach(([sx, z], i) => { this.o3.position.set(sx, PIT_Y + .27, z); this.o3.rotation.set(0, 0, 0); this.o3.scale.setScalar(1); this.o3.updateMatrix(); sp.setMatrixAt(i, this.o3.matrix); }); sp.castShadow = true; G.add(sp);
    // rotten floor tiles
    this.tiles = []; for (const p of L.pits.filter(p => p.cover)){ const n = Math.round((p.x1 - p.x0) / .5), w = (p.x1 - p.x0) / n; for (let i = 0; i < n; i++){ const t = wbox(-w / 2 + .01, w / 2 - .01, -.125, .125, WALL_Z + .05, 2, [M.conc, M.conc, M.carpet, M.conc, M.conc, M.conc]); this.scene.add(t); this.tiles.push(t); } } }

  // ---------------- effects: blood drops, stains, dust, debris
  buildFx(){ const s = this.scene;
    this.drops = new Points(s, 2500, 0); this.sparks = new Points(s, 2500, 0, THREE.AdditiveBlending); this.smoke = new Points(s, 900, 1); this.fire = new Points(s, 900, 1, THREE.AdditiveBlending);
    this.SPL = 2000; this.splats = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', alphaMap: splatTex(), transparent: true, depthWrite: false, roughness: .15, metalness: .2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), this.SPL);
    this.splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.splats.setColorAt(0, new THREE.Color()); this.splats.receiveShadow = true; this.splats.frustumCulled = false; s.add(this.splats);
    const deb = (geo, m, n) => { const o = new THREE.InstancedMesh(geo, m, n); o.castShadow = true; o.count = 0; o.frustumCulled = false; s.add(o); return o; };
    // debris kinds: 0 ceiling tile, 1 concrete, 2 scrap metal, 3 glass, 4 painted body scrap, 5 springs and bolts
    this.deb = [deb(new THREE.BoxGeometry(2, 2, 1.2), this.M.ceil, 60), deb(new THREE.DodecahedronGeometry(1, 0), this.M.conc, 160), deb(new THREE.DodecahedronGeometry(1, 0), this.CM.frame, 200),
      deb(new THREE.TetrahedronGeometry(1, 0), this.CM.glass, 220), deb(new THREE.BoxGeometry(2, 2, 1), this.paint, 200), deb(new THREE.TorusGeometry(.7, .3, 6, 10), this.CM.chrome, 100), deb(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshStandardMaterial({ color: '#b5884e', roughness: .95 }), 120)];
    // props, in PROPS order: drywall blocks, cardboard boxes, filing cabinets, explosive barrels, ceiling slabs
    const card = new THREE.MeshStandardMaterial({ color: '#b5884e', roughness: .95 }), cab = new THREE.MeshStandardMaterial({ color: '#7d8288', roughness: .45, metalness: .5 }), barrel = new THREE.MeshStandardMaterial({ map: barrelTex(), roughness: .5, metalness: .3 }), slab = [this.M.conc, this.M.conc, this.M.conc, this.M.ceil, this.M.conc, this.M.conc];
    this.prop = [deb(new THREE.BoxGeometry(1, 1, 1), this.M.wall, 64 * 4), deb(new THREE.BoxGeometry(1, 1, 1), card, 40), deb(new THREE.BoxGeometry(1, 1, 1), cab, 20), deb(new THREE.CylinderGeometry(.5, .5, 1, 18), barrel, 10), deb(new THREE.BoxGeometry(1, 1, 1), slab, 12)];
    this.propZ = [[-.7, 5], [0, .55], [0, .6], [0, 1], [-1.2, 4]]; }
  reset(){ this.rng = RNG(1234); for (const P of [this.drops, this.sparks, this.smoke, this.fire]) P.list = []; this.nSplat = 0; this.splats.count = 0; this.camState = null; this.fxT = null; this.flashK = 0;
    for (const m of this.carMeshes.values()) this.scene.remove(m); this.carMeshes.clear();
    this.hz.forEach(o => { if (o.g) o.g.visible = true; }); }
  floorAt(x, z){ const p = pitAt(this.L, x); if (p && !(p.cover && this.tileAt(x))) return PIT_Y; return 0; }
  tileAt(x){ return this.tileState && this.tileState.some(t => Math.abs(t[0] - x) < .26 && t[1] > -.3); }
  splat(x, y, z, nx, ny, nz, s, col, sx = 1){ const i = this.nSplat++ % this.SPL, o = this.o3, r = this.rng;
    o.position.set(x + nx * .004, y + ny * .004, z + nz * .004); o.quaternion.setFromUnitVectors(V(0, 0, 1), V(nx, ny, nz)); o.rotateZ(r() * 6.28); s = Math.min(s, 1.2); o.scale.set(s * Math.min(sx, 2), s * (.7 + r() * .5), 1); o.updateMatrix();
    this.splats.setMatrixAt(i, o.matrix); this.splats.setColorAt(i, new THREE.Color(col)); this.splats.count = Math.min(this.SPL, this.nSplat); this.splats.instanceMatrix.needsUpdate = true; this.splats.instanceColor.needsUpdate = true; }
  // a shower of sparks from (x, y): bright, fast, short-lived
  shower(x, y, z, vx, vy, n, sp = 6){ const r = this.rng; for (let i = 0; i < n; i++) this.sparks.add({ x, y, z: z + (r() - .5) * .3, vx: vx + (r() - .5) * sp, vy: vy + r() * sp * .8, vz: (r() - .5) * sp * .8, s: .03 + r() * .04, a: 1, col: r() < .3 ? '#fff3b0' : r() < .6 ? '#ffb030' : '#ff7a18', life: .25 + r() * .5, g: 1 }); }
  oil(x, y, z, vx, vy, n){ const r = this.rng; for (let i = 0; i < n; i++) this.drops.add({ x, y, z: z + (r() - .5) * .6, vx: vx + (r() - .5) * 2, vy: vy + (r() - .5) * 2, vz: (r() - .5) * 2, s: .04 + r() * .06, a: 1, col: OIL[i % 3], life: 5 }); }
  puff(x, y, z, n, col = '#d8cfa8', s = .6, up = .6, life = 1.4){ const r = this.rng; for (let i = 0; i < n; i++) this.smoke.add({ x: x + (r() - .5) * .6, y: y + r() * .3, z: z + (r() - .5) * .8, vx: (r() - .5) * 2, vy: r() * up, vz: (r() - .5) * 2, s: s * (.6 + r() * .8), a: .5, a0: .55, col, life: life * (.8 + r() * .6), grow: 1 }); }
  flame(x, y, z, n, k = 1, up = 1){ const r = this.rng; for (let i = 0; i < n; i++) this.fire.add({ x: x + (r() - .5) * .5 * k, y: y + r() * .2, z: z + (r() - .5) * 1.2 * k, vx: (r() - .5) * .6, vy: (1 + r() * 1.6) * up, vz: (r() - .5) * .6, s: (.25 + r() * .35) * k, a: .8, a0: .8, col: r() < .4 ? '#ffcf5a' : '#ff6a1a', life: .35 + r() * .45, grow: -.4 }); }
  fx(evs){ const r = this.rng;
    for (const e of evs){ const k = e[0];
      if (k === 'cut'){ this.shower(e[1], e[2], 0, 0, 2, 60, 7); }
      if (k === 'split'){ this.shower(e[1], e[2], 0, 0, 1, e[4] === 'saw' ? 30 : 14, 5); if (e[3] === TYPES.indexOf('engine')) this.oil(e[1], e[2], 0, 0, 1, 30); }
      if (k === 'snap' || k === 'partoff'){ this.shower(e[1], e[2] || .6, 0, 0, 1, 10, 3); }
      if (k === 'dent'){ this.shower(e[2], e[3], 0, 0, 1, Math.round(4 + e[1] * 16), 4); }
      if (k === 'glass'){ const [, x, y] = e; for (let i = 0; i < 30; i++) this.sparks.add({ x, y, z: (r() - .5) * 1.6, vx: (r() - .5) * 4, vy: r() * 3, vz: (r() - .5) * 4, s: .025 + r() * .03, a: .9, col: '#dff4ff', life: .3 + r() * .4, g: 1 }); }
      if (k === 'cardboard'){ this.puff(e[1], e[2], 0, 5, '#c9a777', .4, .5, .8); }
      if (k === 'shred'){ this.shower(e[1], e[2], 0, 0, 1, 20, 5); this.puff(e[1], e[2], 0, 4, '#8a857a', .4, .4, 1); }
      if (k === 'crush'){ this.shower(e[1], e[2], 0, 0, 1, 25, 6); this.oil(e[1], e[2], 0, 0, 1, 12); }
      if (k === 'impale' || k === 'pop'){ this.shower(e[1], e[2] ?? .3, 0, 0, 1, 12, 4); if (k === 'pop') this.puff(e[1], .3, 0, 8, '#cfc6a6', .5, .8, .8); }
      if (k === 'boom'){ const [, x, y, big] = e; this.flashK = 1 + big; this.flash.position.set(x, 1.2, .5); this.flame(x, y + .3, 0, Math.round(70 * big), 1.8 * big); this.puff(x, y, 0, Math.round(45 * big), '#2e2a26', 1.3, 2.5, 3); this.shower(x, y, 0, 0, 3, 120, 11);
        this.splat(x, .003, 0, 0, 1, 0, 1.2, '#100d0b'); for (let i = 0; i < 6; i++) this.splat(x + (r() - .5) * 2, .004, (r() - .5) * 2, 0, 1, 0, .3 + r() * .4, OIL[i % 3]); }
      if (k === 'slam'){ this.puff(e[1], .1, 0, 18, '#cbbf98', .7, .8); }
      if (k === 'drywall'){ this.puff(e[1], e[2], -.3, 6 + e[3] * 2, '#e8dcae', .7, .5); }
      if (k === 'smash'){ this.shower(e[1], e[2], 0, 0, 2, 50, 8); }
      if (k === 'rumble'){ const h = this.L.hazards.find(h => h.type === 'slabs'); for (let x = h.x0; x < h.x1; x += .5) this.puff(x, this.L.ceil - .3, -.6, 2, '#d8d2b4', .5, -.8, 2); }
      if (k === 'crack'){ this.puff(e[1], this.L.ceil - .3, -.8, 6, '#d8d2b4', .6, -1, 1.6); }
      if (k === 'crumble'){ this.puff(e[1], e[2] - .3, -.5, 14, '#d8d2b4', .8, -.5); } } }
  stepFx(dt, st, t){ const r = this.rng, g = 9.8, L = this.L;
    // a hurt engine smokes, a dead one burns and leaks oil; a leaking tank sprays fuel and flames until it goes up
    if (st){ const [ex, ey, , dead, hp] = st.engine; if (hp < .6 && r() < (1 - hp) * dt * 30) this.puff(ex, ey + .2, 0, 1, dead ? '#26221e' : '#9a958a', .45, 1.2, 2.2);
      if (dead && !st.won){ if (r() < dt * 40) this.flame(ex, ey + .15, 0, 1, .8); if (r() < dt * 6) this.oil(ex, ey - .2, 0, 0, -.5, 1); }
      if (st.fuse){ const tk = st.pieces.find(p => TYPES[p[1]] === 'tank'); if (tk){ this.flame(tk[4], tk[5], 0, 2, .6); if (r() < dt * 20) this.oil(tk[4], tk[5], 0, 0, -1, 1); } } }
    this.drops.list = this.drops.list.filter(p => { p.t += dt; p.vy -= g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const fy = this.floorAt(p.x, p.z), v = Math.hypot(p.vx, p.vz);
      if (p.y <= fy){ if (r() < .8) this.splat(p.x, fy + .001, p.z, 0, 1, 0, p.s * (1.6 + Math.min(v, 6) * .25) * (1 + r()), p.col, 1 + Math.min(1.2, v * .15)); return false; }
      if (p.z <= WALL_Z && p.y < L.ceil){ this.splat(p.x, p.y, WALL_Z + .001, 0, 0, 1, p.s * (1.8 + r() * 1.5), p.col); return false; }
      return p.t < p.life; });
    this.sparks.list = this.sparks.list.filter(p => { p.t += dt; p.vy -= g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const fy = this.floorAt(p.x, p.z); if (p.y < fy){ p.y = fy; p.vy = Math.abs(p.vy) * .35; p.vx *= .6; p.vz *= .6; } p.a = 1 - p.t / p.life; return p.t < p.life; });
    for (const P of [this.smoke, this.fire]) P.list = P.list.filter(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= .97; p.vz *= .97; p.s = Math.max(.02, p.s + p.grow * dt * .6); p.a = p.a0 * (1 - p.t / p.life); return p.t < p.life && p.y < L.ceil + .3; });
    const sc = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    for (const P of [this.drops, this.sparks, this.smoke, this.fire]){ P.upload(); P.mat.uniforms.scale.value = sc; } }

  // ---------------- camera: a fixed three-quarter view down the corridor, following the character
  fit(){ const cam = this.camera, sa = this.safe || [0, 0], key = [cam.aspect, cam.fov, this.margin, ...sa].join(); if (this.fitC && this.fitC.key === key) return this.fitC;
    const dir = V(Math.sin(VIEW_AZ) * Math.cos(VIEW_EL), Math.sin(VIEW_EL), Math.cos(VIEW_AZ) * Math.cos(VIEW_EL)), m = this.margin || 1.05, pts = [];
    for (const x of [-4, 18]) for (const y of [-.3, 2.2]) for (const z of [WALL_Z + .2, 1.8]) pts.push(V(x, y, z));
    const c = this.fitCam || (this.fitCam = new THREE.PerspectiveCamera()); c.copy(cam); const tv = Math.tan(cam.fov * Math.PI / 360), th = tv * cam.aspect, right = V(0, 0, 0), up = V(0, 0, 0), q = V(0, 0, 0);
    const tgt = V(6, 1, 0); let d = 50;
    for (let i = 0; i < 16; i++){ c.position.copy(tgt).addScaledVector(dir, d); c.lookAt(tgt); c.updateMatrixWorld(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts){ q.copy(p).project(c); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      right.setFromMatrixColumn(c.matrixWorld, 0); up.setFromMatrixColumn(c.matrixWorld, 1); const yt = 1 - sa[0] * 2, yb = -1 + sa[1] * 2;
      tgt.addScaledVector(right, (x0 + x1) / 2 * th * d).addScaledVector(up, ((y0 + y1) - (yt + yb)) / 2 * tv * d); d *= Math.max((x1 - x0) / 2, (y1 - y0) / (yt - yb)) * m; }
    this.scene.fog.near = d * .95; this.scene.fog.far = d * 2.4; return this.fitC = { key, tgt, d, dir }; }
  frameCamera(t, px, py, shake){ const F = this.fit(), cam = this.camera, L = this.L, x = Math.min(Math.max(px, L.length[0] + 2), L.exit - 1), y = Math.min(0, py + .5) * .6;
    const tgt = V(F.tgt.x + x, F.tgt.y + y, F.tgt.z);
    if (!this.camState || t < this.camState.t || t - this.camState.t > .25) this.camState = { tgt: tgt.clone(), t }; else { const k = 1 - Math.exp(-(t - this.camState.t) * 4); this.camState.tgt.lerp(tgt, k); this.camState.t = t; }
    const c = this.camState.tgt; cam.position.copy(c).addScaledVector(F.dir, F.d); cam.lookAt(c);
    if (shake){ cam.position.x += Math.sin(t * 91) * shake; cam.position.y += Math.cos(t * 77) * shake; }
    const sx = Math.round(c.x); this.sun.position.set(sx - 5, 14, 7); this.sun.target.position.set(sx + 3, 0, 0); }

  // ---------------- draw one frame from a physics state (or the idle start state)
  render(t, st, opts = {}){ const L = this.L, dt = this.fxT == null ? 0 : Math.min(.1, Math.max(0, t - this.fxT)); this.fxT = t; const o3 = this.o3, idle = !st;
    if (idle){ if (!this.idleState) this.idleState = createSim(L).state(); st = this.idleState; }
    // car pieces: make meshes for new ones (halves of split pieces), drop meshes of pieces that are gone
    const seen = new Set(), burnt = this.CM.burnt;
    for (const p of st.pieces){ const [id, ti, w, h, x, y, a, hp, flat, , name] = p; seen.add(id); let m = this.carMeshes.get(id); if (!m){ m = this.pieceMesh(TYPES[ti], w, h, name); this.carMeshes.set(id, m); }
      m.position.set(x, y + (idle ? Math.sin(t * 30) * .004 : 0), 0); m.rotation.z = a; m.scale.y = flat ? .35 : 1; m.scale.z = flat ? 1.15 : 1;
      const pm = m.userData.paint; pm.color.copy(this.paint.color).lerp(burnt, Math.min(.85, (1 - hp) * .6 + (st.boomed ? .2 : 0))); }
    for (const [id, m] of this.carMeshes) if (!seen.has(id)){ this.scene.remove(m); this.carMeshes.delete(id); }
    st.wheels.forEach((w, i) => { const g = this.wheelG[i]; g.position.set(w[0], w[1], 0); g.rotation.z = w[2]; g.scale.set(w[3], w[3], 1); });
    // traps
    this.hz.forEach((o, i) => { const h = o.h, hs = !idle && st.hazards[i];
      if (h.type === 'crusher'){ const y = hs ? hs.pos[1] : L.ceil - .6; o.g.position.set(h.x, y, 0); }
      if (h.type === 'saw'){ const p = hs ? hs.pos : [h.path[0][0], h.path[0][1], 0]; o.s.position.set(p[0], p[1], 0); o.s.rotation.z = p[2]; }
      if (h.type === 'ball'){ const a = h.amp * Math.sin(2 * Math.PI * ((idle ? 0 : st.t) + h.phase) / h.period), bx = h.x + Math.sin(a) * h.len, by = L.ceil - Math.cos(a) * h.len;
        o.ball.position.set(bx, by, 0); o.ball.rotation.z = a; o.chain.position.set((h.x + bx) / 2, (L.ceil + by) / 2, 0); o.chain.scale.y = h.len - .5; o.chain.rotation.z = a; }
      if (h.type === 'flame' && hs && hs.on){ for (const z of [-.5, 0, .5]){ this.flame(h.x, .12, z, 3, .55, 3.2); } if (this.rng() < .3) this.puff(h.x, 2.2, 0, 1, '#2e2a26', .5, .8, 1.4); }
      if (h.type === 'mine'){ o.g.visible = !(hs && hs.gone); o.led.visible = hs && hs.armed ? Math.sin(t * 40) > 0 : Math.sin(t * 4 + i) > .3; } });
    this.tileState = idle ? null : st.tiles; this.tiles.forEach((m, i) => { const p = st.tiles[i]; m.position.set(p[0], p[1], 0); m.rotation.z = p[2]; });
    // props: the slabs above a collapsing ceiling shake before they come down
    const np = this.prop.map(() => 0), sh = this.hz.find(o => o.h.type === 'slabs'), shake = !idle && sh && st.hazards[this.hz.indexOf(sh)].fired >= 0;
    for (const q of st.props || []){ const [x, y, a, k, w, h, lit, dyn, id] = q, [zc, d] = this.propZ[k], z = k === 1 || k === 2 || k === 3 ? ((id * 0.618) % 1 - .5) * 1.2 : zc, j = k === 4 && shake && !dyn ? .03 : 0;
      if (k === 0){ // a drywall block is drawn as four chunks across the room; loose ones tumble apart
        for (let c = 0; c < 4; c++){ const zz = WALL_Z + .02 + (c + .5) * 1.25, sp = dyn ? 1 : 0, h1 = ((id * 7 + c * 13) % 10) / 10 - .5; o3.position.set(x + h1 * .3 * sp, y + h1 * .2 * sp, zz + h1 * .4 * sp); o3.rotation.set(h1 * .6 * sp, h1 * .9 * sp, a + h1 * .5 * sp); o3.scale.set(w, h, 1.23); o3.updateMatrix(); this.prop[0].setMatrixAt(np[0]++, o3.matrix); } continue; }
      o3.position.set(x + (this.rng() - .5) * j, y + (this.rng() - .5) * j, z); o3.rotation.set(0, 0, a); o3.scale.set(w, h, k === 3 ? w : d); o3.updateMatrix(); this.prop[k].setMatrixAt(np[k]++, o3.matrix);
      if (lit && this.rng() < .5){ this.flame(x, y + h / 2, z, 1, .35); this.shower(x, y + h / 2, z, 0, 1, 1, 2); } }
    this.prop.forEach((m, k) => { m.count = np[k]; m.instanceMatrix.needsUpdate = true; });
    // debris
    const n = this.deb.map(() => 0); if (!idle) for (const d of st.debris){ const k = d[3]; o3.position.set(d[0], d[1], (d[4] * 977 % 1.6) - .8); o3.rotation.set(d[4] * 31, d[4] * 17, d[2]);
      if (k === 0 || k === 4 || k === 6) o3.scale.set(d[4], Math.max(d[5], .012), k ? .5 * d[4] : .25); else o3.scale.setScalar(d[4]); o3.updateMatrix(); if (n[k] < this.deb[k].instanceMatrix.count) this.deb[k].setMatrixAt(n[k]++, o3.matrix); }
    this.deb.forEach((m, k) => { m.count = n[k]; m.instanceMatrix.needsUpdate = true; });
    // lights hum and flicker; explosions flash
    this.lights.forEach(l => { const f = l.k % 7 === 3 ? (Math.sin(t * 23 + l.k) + Math.sin(t * 7.3) > 1.2 ? 0 : 1) : 1; l.m.material = f ? this.M.light : this.M.lightOff; });
    this.flashK *= Math.pow(.004, dt); this.flash.intensity = this.flashK * 60;
    if (opts.events) this.fx(opts.events); this.stepFx(dt, idle ? null : st, t);
    this.frameCamera(t, st.car[0], st.car[1] - .9, opts.shake || 0);
    this.renderer.render(this.scene, this.camera); }
}
