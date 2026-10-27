// The 3D view: a backrooms corridor (yellow wallpaper, damp carpet, humming lights), the ragdoll, the traps,
// blood that sprays, drips and stains every surface, debris — plus the follow camera.
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor-rbox.js?v=20261027003910';
import { PARTS, PIT_Y, pitAt } from './physics.js?v=20261027003910';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t, clamp01 = x => Math.min(1, Math.max(0, x));
const RNG = s => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
// camera viewing angle (radians): azimuth around the vertical axis (negative = from behind the character) and elevation
export const VIEW_AZ = -1.3, VIEW_EL = .62;
const WALL_Z = -1.6, ROOM_Z = 14;      // the yellow wall behind the path, and how far the room reaches towards the camera side
const BLOOD = ['#6e0000', '#8a0303', '#5a0000', '#a00808'];

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
  constructor(scene, n, soft){ this.n = n; this.list = []; const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { scale: { value: 800 }, soft: { value: soft } }, vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false });
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
    this.buildRoom(); this.buildBody(); this.buildTraps(); this.buildFx();
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

  // ---------------- the character: one mesh group per body part, plus red stumps that appear where it tears
  buildBody(){ const skin = new THREE.MeshStandardMaterial({ color: '#e0a07a', roughness: .7 }), shirt = new THREE.MeshStandardMaterial({ color: '#3d7a8c', roughness: .85 }), pants = new THREE.MeshStandardMaterial({ color: '#2b3040', roughness: .9 }),
      shoe = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: .6 }), hair = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: .9 }), eye = new THREE.MeshBasicMaterial({ color: '#111' });
    this.meat = new THREE.MeshStandardMaterial({ color: '#7a0a0a', roughness: .3, emissive: '#200000' }); this.bone = new THREE.MeshStandardMaterial({ color: '#efe6d0', roughness: .5 });
    const rb = (w, h, d, m) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * .3), m); o.castShadow = o.receiveShadow = true; return o; };
    this.body = PARTS.map((P, i) => { const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
      if (P.n === 'torso') inner.add(rb(.36, .62, .38, shirt));
      else if (P.n === 'head'){ const h = new THREE.Mesh(new THREE.SphereGeometry(P.r, 20, 14), skin); h.scale.set(1, 1.08, 1); h.castShadow = true; inner.add(h); const hr = new THREE.Mesh(new THREE.SphereGeometry(P.r * 1.04, 20, 10, 0, Math.PI * 2, 0, 1.3), hair); hr.rotation.z = .35; inner.add(hr);
        for (const z of [-.06, .06]){ const e = new THREE.Mesh(new THREE.BoxGeometry(.03, .045, .025), eye); e.position.set(.125, .02, z); inner.add(e); this.eyes = (this.eyes || []).concat(e); } }
      else { const arm = P.n.startsWith('arm'), fore = P.n.startsWith('fore'), shin = P.n.startsWith('shin'); inner.add(rb(P.w * 2.05, P.h * 2.05, P.w * 2.1, arm ? shirt : fore ? skin : pants)); if (shin){ const s = rb(.24, .09, .15, shoe); s.position.set(.05, -P.h + .02, 0); inner.add(s); } }
      g.userData.z = P.z || 0; this.scene.add(g); return { g, inner, caps: [] }; });
    // stumps: on the part (where it was attached) and on its parent; a bit of bone sticks out
    PARTS.forEach((P, i) => { if (P.p == null) return; const par = PARTS[P.p], rad = (Q) => (Q.r || Q.w) * 1.05;
      const cap = (owner, ly, rr, dir) => { const c = new THREE.Group(), m = new THREE.Mesh(new THREE.SphereGeometry(rr, 12, 8), this.meat); m.scale.set(1, .55, 1); c.add(m);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(rr * .3, rr * .35, rr * 1.4, 8), this.bone); b.position.y = dir * rr * .5; c.add(b); c.position.y = ly; c.visible = false; this.body[owner].inner.add(c); this.body[i].caps.push(c); };
      cap(i, P.jy - P.y, rad(P), 1); cap(P.p, P.jy - par.y, P.n === 'head' ? .1 : rad(P), -1); });
  }

  // ---------------- traps
  buildTraps(){ const L = this.L, M = this.M, G = this.room;
    this.hz = L.hazards.map(h => {
      if (h.type === 'crusher'){ const g = new THREE.Group(), sm = new THREE.MeshStandardMaterial({ map: stripes(), roughness: .5, metalness: .3 }), mats = [M.dark, M.dark, M.dark, M.dark, sm, M.dark];
        const b = wbox(-h.w / 2, h.w / 2, -.6, .6, -1.25, 1.25, mats, .8); g.add(b);
        for (const z of [-.7, .7]){ const rod = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 6, 12), M.steel); rod.position.set(0, 3.6, z); rod.castShadow = true; g.add(rod); }
        this.scene.add(g); return { h, g, blood: 0 }; }
      if (h.type === 'saw'){ const s = new THREE.Group(), disc = new THREE.Mesh(new THREE.CylinderGeometry(h.r * .85, h.r * .85, .06, 40), M.steel); disc.rotation.x = Math.PI / 2; s.add(disc);
        for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, t = new THREE.Mesh(new THREE.ConeGeometry(.12, .34, 4), M.steel); t.position.set(Math.cos(a) * h.r * .95, Math.sin(a) * h.r * .95, 0); t.rotation.z = a - Math.PI / 2 - .4; s.add(t); }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .14, 20), new THREE.MeshStandardMaterial({ color: '#c0281d' })); hub.rotation.x = Math.PI / 2; s.add(hub); s.traverse(o => o.castShadow = true); this.scene.add(s);
        const [a, b] = h.path, vert = Math.abs(b[0] - a[0]) < .01;
        if (vert) G.add(wbox(a[0] - .06, a[0] + .06, 0, L.ceil, -.35, -.25, M.dark)); else G.add(wbox(Math.min(a[0], b[0]) - h.r, Math.max(a[0], b[0]) + h.r, -.02, .005, -.06, .06, M.dark));
        return { h, s }; }
      if (h.type === 'mine'){ const g = new THREE.Group(), base = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .08, 20), M.dark); base.position.y = .04; base.castShadow = true; g.add(base);
        const led = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false })); led.position.y = .1; g.add(led); g.position.set(h.x, 0, 0); this.scene.add(g); return { h, g, led }; }
      return { h }; });
    // spikes fill the bottom of every trench across the path
    const spikes = []; for (const p of L.pits) for (let sx = p.x0 + .25; sx < p.x1 - .1; sx += .45) for (let z = -1.4; z <= 1.41; z += .4) spikes.push([sx + (z * 7 % .2), z]);
    const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(.13, .55, 10), M.steel, spikes.length); spikes.forEach(([sx, z], i) => { this.o3.position.set(sx, PIT_Y + .27, z); this.o3.rotation.set(0, 0, 0); this.o3.scale.setScalar(1); this.o3.updateMatrix(); sp.setMatrixAt(i, this.o3.matrix); }); sp.castShadow = true; G.add(sp);
    // rotten floor tiles
    this.tiles = []; for (const p of L.pits.filter(p => p.cover)){ const n = Math.round((p.x1 - p.x0) / .5), w = (p.x1 - p.x0) / n; for (let i = 0; i < n; i++){ const t = wbox(-w / 2 + .01, w / 2 - .01, -.125, .125, -1.6, 1.6, [M.conc, M.conc, M.carpet, M.conc, M.conc, M.conc]); this.scene.add(t); this.tiles.push(t); } } }

  // ---------------- effects: blood drops, stains, dust, debris
  buildFx(){ const s = this.scene;
    this.drops = new Points(s, 4000, 0); this.dust = new Points(s, 600, 1);
    this.SPL = 3000; this.splats = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', alphaMap: splatTex(), transparent: true, depthWrite: false, roughness: .2, metalness: .1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), this.SPL);
    this.splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.splats.setColorAt(0, new THREE.Color()); this.splats.receiveShadow = true; this.splats.frustumCulled = false; s.add(this.splats);
    const deb = (geo, m, n) => { const o = new THREE.InstancedMesh(geo, m, n); o.castShadow = true; o.count = 0; o.frustumCulled = false; s.add(o); return o; };
    this.chunks = deb(new THREE.DodecahedronGeometry(1, 0), this.M.conc, 160); this.panels = deb(new THREE.BoxGeometry(2, 2, 1.2), this.M.ceil, 60); this.gibs = deb(new THREE.IcosahedronGeometry(1, 0), this.meat, 120); }
  reset(){ this.rng = RNG(1234); this.drops.list = []; this.dust.list = []; this.nSplat = 0; this.splats.count = 0; this.camState = null; this.fxT = null; this.flashK = 0; 
    this.hz.forEach(o => { if (o.g) o.g.visible = true; if (o.s){ o.bloody = 0; o.s.children[0].material = this.M.steel; } }); this.body.forEach(b => { b.caps.forEach(c => c.visible = false); b.inner.scale.set(1, 1, 1); }); }
  floorAt(x, z){ const p = pitAt(this.L, x); if (p && !(p.cover && this.tileAt(x))) return PIT_Y; return 0; }
  tileAt(x){ return this.tileState && this.tileState.some(t => Math.abs(t[0] - x) < .26 && t[1] > -.3); }
  splat(x, y, z, nx, ny, nz, s, col, sx = 1){ const i = this.nSplat++ % this.SPL, o = this.o3, r = this.rng;
    o.position.set(x + nx * .004, y + ny * .004, z + nz * .004); o.quaternion.setFromUnitVectors(V(0, 0, 1), V(nx, ny, nz)); o.rotateZ(r() * 6.28); s = Math.min(s, .9); o.scale.set(s * Math.min(sx, 2), s * (.7 + r() * .5), 1); o.updateMatrix();
    this.splats.setMatrixAt(i, o.matrix); this.splats.setColorAt(i, new THREE.Color(col)); this.splats.count = Math.min(this.SPL, this.nSplat); this.splats.instanceMatrix.needsUpdate = true; this.splats.instanceColor.needsUpdate = true; }
  // a burst of blood: n drops from (x, y) moving roughly (vx, vy) with some spread
  spray(x, y, z, vx, vy, n, spread = 3, size = 1){ const r = this.rng; for (let i = 0; i < n; i++) this.drops.add({ x, y, z: z + (r() - .5) * .2, vx: vx + (r() - .5) * spread, vy: vy + (r() - .5) * spread, vz: (r() - .5) * spread * .9, s: (.035 + r() * .07) * size, a: 1, col: BLOOD[Math.floor(r() * 4)], life: 6 }); }
  puff(x, y, z, n, col = '#d8cfa8', s = .6, up = .6){ const r = this.rng; for (let i = 0; i < n; i++) this.dust.add({ x: x + (r() - .5) * .6, y: y + r() * .3, z: z + (r() - .5) * .8, vx: (r() - .5) * 2, vy: r() * up, vz: (r() - .5) * 2, s: s * (.6 + r() * .8), a: .5, col, life: 1.2 + r() * 1.4, grow: 1 }); }
  fx(evs, st){ const r = this.rng;
    for (const e of evs){ const k = e[0];
      if (k === 'sever'){ const [, x, y, vx, vy, i, why] = e, n = why === 'crush' ? 60 : 110; this.spray(x, y, PARTS[i].z || 0, vx * .5, vy * .5 + 1.5, n, 5, 1.2); }
      if (k === 'cut'){ const [, x, y, tx, ty] = e; this.spray(x, y, 0, tx * .6, ty * .6 + 2, 70, 4); const sw = this.hz.find(o => o.s && Math.hypot(o.s.position.x - x, o.s.position.y - y) < 1.5); if (sw) sw.bloody = 1; }
      if (k === 'impale'){ this.spray(e[1], e[2], 0, 0, 3, 80, 4, 1.2); }
      if (k === 'squish'){ const [, x, y, s] = e; this.spray(x, y + .2, 0, 0, 2, Math.round(260 * s), 9, 1.6); for (let i = 0; i < 10 * s; i++) this.splat(x + (r() - .5) * 2.5, .002, (r() - .5) * 2.5, 0, 1, 0, .2 + r() * .45, BLOOD[i % 4]); }
      if (k === 'splat'){ this.spray(e[1], e[2], 0, 0, 1.5, Math.round(12 * e[3]), 2.5); }
      if (k === 'boom'){ const [, x, y] = e; this.flashK = 1; this.flash.position.set(x, 1.2, .5); this.puff(x, y, 0, 40, '#4a4238', 1.2, 2.5); this.puff(x, y, 0, 25, '#ffb347', .7, 3); this.splat(x, .003, 0, 0, 1, 0, 1.1, '#1a1612'); for (let i = 0; i < 5; i++) this.splat(x + (r() - .5) * 1.5, .004, (r() - .5) * 1.5, 0, 1, 0, .3 + r() * .4, '#26201a'); }
      if (k === 'slam'){ this.puff(e[1], .1, 0, 18, '#cbbf98', .7, .8); }
      if (k === 'crumble'){ this.puff(e[1], e[2] - .3, -.5, 14, '#d8d2b4', .8, -.5); } } }
  stepFx(dt, st, t){ const r = this.rng, g = 9.8, L = this.L;
    // open wounds spurt with the heartbeat while alive, then dribble
    if (st) for (const w of st.wounds){ const [x, y, a, rate, vx, vy, pi] = w, beat = st.alive ? .5 + .5 * Math.max(0, Math.sin(t * 9)) : .25, n = rate * beat * dt * 90; let c = Math.floor(n) + (r() < n % 1 ? 1 : 0);
      const sp = (st.alive ? 2.6 : 1.1) * (.6 + rate * .5); while (c-- > 0) this.drops.add({ x, y, z: (PARTS[pi].z || 0) + (r() - .5) * .1, vx: vx + Math.cos(a) * sp + (r() - .5) * .8, vy: vy + Math.sin(a) * sp + (r() - .5) * .8, vz: (r() - .5) * 1.2, s: .03 + r() * .05, a: 1, col: BLOOD[Math.floor(r() * 4)], life: 6 }); }
    // drops fly, then stain whatever they hit: floor, trench bottom, the wall, or the far side of the room
    this.drops.list = this.drops.list.filter(p => { p.t += dt; p.vy -= g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const fy = this.floorAt(p.x, p.z), v = Math.hypot(p.vx, p.vz);
      if (p.y <= fy){ if (r() < .8) this.splat(p.x, fy + .001, p.z, 0, 1, 0, p.s * (1.6 + Math.min(v, 6) * .25) * (1 + r()), p.col, 1 + Math.min(1.2, v * .15)); return false; }
      if (p.z <= WALL_Z && p.y < L.ceil){ this.splat(p.x, p.y, WALL_Z + .001, 0, 0, 1, p.s * (1.8 + r() * 1.5), p.col); return false; }
      if (p.y >= L.ceil && p.z < -.5){ p.vy = -Math.abs(p.vy) * .2; }
      return p.t < p.life; });
    this.dust.list = this.dust.list.filter(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= .97; p.vz *= .97; p.vy = p.vy * .97 + (p.col === '#ffb347' ? 0 : .1 * dt); p.s += p.grow * dt * .6; p.a = .55 * (1 - p.t / p.life); return p.t < p.life; });
    this.drops.upload(); this.dust.upload();
    const sc = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(this.camera.fov * Math.PI / 360)); this.drops.mat.uniforms.scale.value = this.dust.mat.uniforms.scale.value = sc; }

  // ---------------- camera: a fixed three-quarter view down the corridor, following the character
  fit(){ const cam = this.camera, sa = this.safe || [0, 0], key = [cam.aspect, cam.fov, this.margin, ...sa].join(); if (this.fitC && this.fitC.key === key) return this.fitC;
    const dir = V(Math.sin(VIEW_AZ) * Math.cos(VIEW_EL), Math.sin(VIEW_EL), Math.cos(VIEW_AZ) * Math.cos(VIEW_EL)), m = this.margin || 1.05, pts = [];
    for (const x of [-2.5, 14]) for (const y of [-.3, 2.2]) for (const z of [-1, 1]) pts.push(V(x, y, z));
    const c = this.fitCam || (this.fitCam = new THREE.PerspectiveCamera()); c.copy(cam); const tv = Math.tan(cam.fov * Math.PI / 360), th = tv * cam.aspect, right = V(0, 0, 0), up = V(0, 0, 0), q = V(0, 0, 0);
    const tgt = V(5, 1, 0); let d = 40;
    for (let i = 0; i < 16; i++){ c.position.copy(tgt).addScaledVector(dir, d); c.lookAt(tgt); c.updateMatrixWorld(); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts){ q.copy(p).project(c); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      right.setFromMatrixColumn(c.matrixWorld, 0); up.setFromMatrixColumn(c.matrixWorld, 1); const yt = 1 - sa[0] * 2, yb = -1 + sa[1] * 2;
      tgt.addScaledVector(right, (x0 + x1) / 2 * th * d).addScaledVector(up, ((y0 + y1) - (yt + yb)) / 2 * tv * d); d *= Math.max((x1 - x0) / 2, (y1 - y0) / (yt - yb)) * m; }
    return this.fitC = { key, tgt, d, dir }; }
  frameCamera(t, px, py, shake){ const F = this.fit(), cam = this.camera, L = this.L, x = Math.min(Math.max(px, L.length[0] + 2), L.exit - 1), y = Math.min(0, py + .5) * .6;
    const tgt = V(F.tgt.x + x, F.tgt.y + y, F.tgt.z);
    if (!this.camState || t < this.camState.t || t - this.camState.t > .25) this.camState = { tgt: tgt.clone(), t }; else { const k = 1 - Math.exp(-(t - this.camState.t) * 4); this.camState.tgt.lerp(tgt, k); this.camState.t = t; }
    const c = this.camState.tgt; cam.position.copy(c).addScaledVector(F.dir, F.d); cam.lookAt(c);
    if (shake){ cam.position.x += Math.sin(t * 91) * shake; cam.position.y += Math.cos(t * 77) * shake; }
    const sx = Math.round(c.x); this.sun.position.set(sx - 5, 14, 7); this.sun.target.position.set(sx + 3, 0, 0); }

  // ---------------- draw one frame from a physics state (or the idle start state)
  render(t, st, opts = {}){ const L = this.L, dt = this.fxT == null ? 0 : Math.min(.1, Math.max(0, t - this.fxT)); this.fxT = t; const o3 = this.o3;
    // body
    PARTS.forEach((P, i) => { const b = this.body[i], s = st ? st.parts[i] : [L.start, P.y, 0, 1, 0, 0]; b.g.position.set(s[0], s[1], b.g.userData.z); b.g.rotation.z = s[2]; if (s[4]) b.inner.scale.set(1.5, .25, 1.3); });
    if (st) PARTS.forEach((P, i) => { if (P.p != null && st.parts[i][5]) this.body[i].caps.forEach(c => c.visible = true); });
    if (!st) this.body.forEach((b, i) => { b.inner.position.y = Math.sin(t * 2.2) * .006; });
    // traps
    this.hz.forEach((o, i) => { const h = o.h, hs = st && st.hazards[i];
      if (h.type === 'crusher'){ const y = hs ? hs.pos[1] : L.ceil - .6; o.g.position.set(h.x, y, 0); }
      if (h.type === 'saw'){ const p = hs ? hs.pos : [h.path[0][0], h.path[0][1], 0]; o.s.position.set(p[0], p[1], 0); o.s.rotation.z = p[2]; if (o.bloody){ o.s.children[0].material = this.meat; } }
      if (h.type === 'mine'){ o.g.visible = !(hs && hs.gone); o.led.visible = hs && hs.armed ? Math.sin(t * 40) > 0 : Math.sin(t * 4 + i) > .3; } });
    this.tileState = st ? st.tiles : null; this.tiles.forEach((m, i) => { const p = st ? st.tiles[i] : null; if (p){ m.position.set(p[0], p[1], 0); m.rotation.z = p[2]; } else { const q = this.L.pits.filter(p => p.cover); let k = i; for (const pp of q){ const n = Math.round((pp.x1 - pp.x0) / .5), w = (pp.x1 - pp.x0) / n; if (k < n){ m.position.set(pp.x0 + (k + .5) * w, -.125, 0); m.rotation.z = 0; break; } k -= n; } } });
    // debris
    let nc = 0, np = 0, ng = 0; if (st) for (const d of st.debris){ o3.position.set(d[0], d[1], (d[4] * 977 % 1.6) - .8); o3.rotation.set(d[4] * 31, d[4] * 17, d[2]);
      if (d[3] === 0){ o3.scale.set(d[4] / 2 * 2, d[5] / 2 * 2, .25); o3.updateMatrix(); this.panels.setMatrixAt(np++, o3.matrix); } else { o3.scale.setScalar(d[4]); o3.updateMatrix(); if (d[3] === 2) this.gibs.setMatrixAt(ng++, o3.matrix); else this.chunks.setMatrixAt(nc++, o3.matrix); } }
    for (const [m, n] of [[this.chunks, nc], [this.panels, np], [this.gibs, ng]]){ m.count = n; m.instanceMatrix.needsUpdate = true; }
    // lights hum and flicker; explosions flash
    this.lights.forEach(l => { const f = l.k % 7 === 3 ? (Math.sin(t * 23 + l.k) + Math.sin(t * 7.3) > 1.2 ? 0 : 1) : 1; l.m.material = f ? this.M.light : this.M.lightOff; });
    this.flashK *= Math.pow(.004, dt); this.flash.intensity = this.flashK * 60;
    if (opts.events) this.fx(opts.events, st); this.stepFx(dt, st, t);
    const p = st ? st.parts[0] : [L.start, 1.15]; this.frameCamera(t, p[0], p[1], opts.shake || 0);
    this.renderer.render(this.scene, this.camera); }
}
