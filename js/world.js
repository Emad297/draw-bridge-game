// The world around the cliffs, different for every style: distant mountains / skylines, hills, vegetation, props,
// and decorations on the cliff faces. Everything is merged into a handful of meshes (vertex colours) so phones stay fast.
import * as THREE from 'three';
import { mergeGeometries } from './vendor-bgu.js';

const RNG = s => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
export function fbm1(seed){ const r = RNG(seed), G = Array.from({ length: 512 }, r), s = t => t * t * (3 - 2 * t);
  const n = x => { const i = Math.floor(x), f = s(x - i); return G[i & 511] + (G[(i + 1) & 511] - G[i & 511]) * f; };
  return (x, o = 5) => { let v = 0, a = .5, f = 1; for (let k = 0; k < o; k++){ v += a * n(x * f + k * 17.3); a *= .5; f *= 2.1; } return v; }; }
export function fbm2(seed){ const r = RNG(seed), G = Array.from({ length: 4096 }, r), s = t => t * t * (3 - 2 * t), v = (x, y) => G[((x & 63) * 64 + (y & 63))];
  const n = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi), a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  return (x, y, o = 4) => { let t = 0, a = .5, f = 1; for (let k = 0; k < o; k++){ t += a * n(x * f, y * f); a *= .5; f *= 2; } return t; }; }

// ---- batching: every part is coloured by vertex colour and merged per material
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), VS = new THREE.Vector3(), VP = new THREE.Vector3();
class Batch {
  constructor(){ this.parts = new Map(); }
  add(geo, color, x = 0, y = 0, z = 0, o = {}){ let g = geo.index ? geo.toNonIndexed() : geo.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    E.set(o.rx || 0, o.ry || 0, o.rz || 0); Q.setFromEuler(E); VS.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1); M4.compose(VP.set(x, y, z), Q, VS); g.applyMatrix4(M4); if (o.m) g.applyMatrix4(o.m);
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++){ a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); const key = o.mat || 'std'; if (!this.parts.has(key)) this.parts.set(key, []); this.parts.get(key).push(g); return this; }
  build(group, mats){ for (const [k, l] of this.parts){ for (let i = 0; i < l.length; i += 400){ const m = new THREE.Mesh(mergeGeometries(l.slice(i, i + 400)), mats[k]); m.castShadow = k !== 'glow' && k !== 'far'; m.receiveShadow = k !== 'glow'; group.add(m); } } this.parts.clear(); } }

// ---- shapes
const G = { cyl: (rt, rb, h, s = 8) => new THREE.CylinderGeometry(rt, rb, h, s), cone: (r, h, s = 8) => new THREE.ConeGeometry(r, h, s), ico: (r, d = 1) => new THREE.IcosahedronGeometry(r, d), dod: r => new THREE.DodecahedronGeometry(r, 0), box: (w, h, d) => new THREE.BoxGeometry(w, h, d), sph: (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h), tor: (r, t, a) => new THREE.TorusGeometry(r, t, 6, 12, a) };
function lumpy(geo, amt, seed){ const g = geo.index ? geo.toNonIndexed() : geo.clone(), p = g.attributes.position, r = RNG(seed), cache = new Map();
  for (let i = 0; i < p.count; i++){ const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!cache.has(k)) cache.set(k, 1 + (r() - .5) * amt); const f = cache.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
  g.computeVertexNormals(); return g; }
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k);
const P = {
  pine(b, x, y, z, s, r, snow){ b.add(G.cyl(.12, .18, 1.2), '#5a3a22', x, y + .6 * s, z, { s }); const greens = ['#2f5a34', '#335f38', '#2a5030'];
    for (let i = 0; i < 4; i++){ const h = (1.6 - i * .25) * s, yy = y + (1.0 + i * .75) * s; b.add(G.cone((1.2 - i * .24) * s, h, 9), greens[i % 3], x, yy, z, { ry: r() * 3 }); if (snow) b.add(G.cone((1.0 - i * .22) * s, h * .45, 9), '#f4f8ff', x, yy + h * .3, z); } },
  round(b, x, y, z, s, r, cols = ['#4f8f3a', '#5fa044', '#3f7a30']){ b.add(G.cyl(.14, .22, 2, 6), '#6a4a2e', x, y + 1 * s, z, { s });
    for (let i = 0; i < 4; i++) b.add(lumpy(G.ico(1, 1), .3, i + 9), cols[i % cols.length], x + (r() - .5) * 1.2 * s, y + (2.3 + r() * .9) * s, z + (r() - .5) * 1.2 * s, { s: (.8 + r() * .5) * s }); },
  cypress(b, x, y, z, s, r){ b.add(G.cyl(.1, .14, .8, 6), '#5a4030', x, y + .4 * s, z, { s }); b.add(lumpy(G.ico(1, 1), .2, 3), '#2f5a2c', x, y + 2.6 * s, z, { sx: .65 * s, sy: 2.4 * s, sz: .65 * s }); },
  palm(b, x, y, z, s, r, dark){ let px = x, py = y, lean = (r() - .5) * .5; const tc = dark || '#8a6a44', lc = dark || '#3f8a38';
    for (let i = 0; i < 7; i++){ b.add(G.cyl(.13, .16, .8, 6), shade(tc, .9 + (i % 2) * .15), px, py + .4 * s, z, { rz: -lean * (1 + i * .15), s }); px += Math.sin(lean * (1 + i * .15)) * .8 * s; py += Math.cos(lean) * .78 * s; }
    for (let k = 0; k < 8; k++){ const a = k / 8 * Math.PI * 2; b.add(G.cone(.28, 2.4, 4), lc, px + Math.cos(a) * 1 * s, py - .15 * s, z + Math.sin(a) * 1 * s, { s, rz: Math.cos(a) * 1.9, rx: -Math.sin(a) * 1.9, sx: s * .5 }); } },
  bush(b, x, y, z, s, r, cols = ['#3f7a30', '#4f8a38']){ for (let i = 0; i < 3; i++) b.add(lumpy(G.ico(.6, 1), .35, i), cols[i % cols.length], x + (r() - .5) * s, y + .35 * s, z + (r() - .5) * s, { s: s * (.7 + r() * .5) }); },
  tuft(b, x, y, z, s, r, col = '#4f8f3a'){ for (let i = 0; i < 4; i++) b.add(G.cone(.05, .5, 3), shade(col, .8 + r() * .4), x + (r() - .5) * .25, y + .22 * s, z + (r() - .5) * .25, { s, rz: (r() - .5) * .7, rx: (r() - .5) * .7 }); },
  rock(b, x, y, z, s, r, col = '#7a7268'){ b.add(lumpy(G.dod(1), .45, Math.floor(r() * 99)), shade(col, .85 + r() * .3), x, y + .3 * s, z, { s, sy: s * (.5 + r() * .4), ry: r() * 6 }); },
  cactus(b, x, y, z, s, r){ const c = '#3f7a44'; b.add(G.cyl(.25, .28, 3, 8), c, x, y + 1.5 * s, z, { s }); b.add(G.sph(.25, 8, 6), c, x, y + 3 * s, z, { s });
    for (const d of [-1, 1]) if (r() < .8){ const h = 1 + r(); b.add(G.cyl(.16, .16, .7, 6), c, x + d * .45 * s, y + h * s, z, { s, rz: Math.PI / 2 }); b.add(G.cyl(.16, .16, 1, 6), c, x + d * .78 * s, y + (h + .45) * s, z, { s }); b.add(G.sph(.16, 6, 5), c, x + d * .78 * s, y + (h + .95) * s, z, { s }); } },
  lollipop(b, x, y, z, s, r){ b.add(G.cyl(.06, .06, 3, 6), '#ffffff', x, y + 1.5 * s, z, { s }); b.add(G.cyl(.9, .9, .25, 20), ['#ff5fa2', '#7fe0c4', '#ffd84a', '#8fb0ff'][Math.floor(r() * 4)], x, y + 3.6 * s, z, { s, rx: Math.PI / 2 }); },
  cane(b, x, y, z, s, r){ for (let i = 0; i < 8; i++) b.add(G.cyl(.14, .14, .4, 8), i % 2 ? '#ffffff' : '#e8304a', x, y + (.2 + i * .4) * s, z, { s }); b.add(G.tor(.45, .14, Math.PI), '#e8304a', x + .45 * s, y + 3.2 * s, z, { s }); },
  gumdrop(b, x, y, z, s, r){ b.add(G.sph(1, 12, 8), ['#ff7ab0', '#7fe0c4', '#ffd84a', '#b08aff', '#ff9a5a'][Math.floor(r() * 5)], x, y, z, { s, sy: s * .9 }); },
  icespike(b, x, y, z, s, r){ b.add(G.cone(.5, 3, 5), r() < .5 ? '#cdeeff' : '#a8dcf5', x, y + 1.4 * s, z, { s, rz: (r() - .5) * .4, rx: (r() - .5) * .4 }); },
  column(b, x, y, z, s, h, col = '#f2efe8', broken){ b.add(G.box(1.2, .3, 1.2), col, x, y + .15, z, { s }); b.add(G.cyl(.42, .48, h, 14), col, x, y + .3 * s + h * s / 2, z, { s }); if (!broken) b.add(G.box(1.2, .3, 1.2), col, x, y + (.45 + h) * s, z, { s }); },
  streetlight(b, x, y, z, s){ b.add(G.cyl(.07, .09, 5, 6), '#2a2c34', x, y + 2.5, z, { s }); b.add(G.box(.9, .08, .2), '#2a2c34', x + .4, y + 5, z); b.add(G.box(.4, .1, .25), '#fff1c0', x + .75, y + 4.92, z, { mat: 'glow' }); },
  chimney(b, x, y, z, s, h){ b.add(G.cyl(.7, .9, h, 14), '#7a5040', x, y + h / 2, z); for (let i = 1; i < h / 3; i++) b.add(G.cyl(.74, .74, .2, 14), '#e8e8e8', x, y + i * 3, z); b.add(G.cyl(.8, .75, .4, 14), '#3a3a3a', x, y + h, z); },
  tank(b, x, y, z, s){ b.add(G.cyl(2.2, 2.2, 5, 18), '#b8bec8', x, y + 2.5, z, { s }); b.add(G.sph(2.2, 18, 8), '#b8bec8', x, y + 5 * s, z, { s, sy: s * .4 }); for (let i = 0; i < 4; i++) b.add(G.cyl(.08, .08, 5, 5), '#4a4f58', x + Math.cos(i * 1.57) * 2.25 * s, y + 2.5, z + Math.sin(i * 1.57) * 2.25 * s, { s }); },
  block(b, x, y, z, s, col, r){ b.add(G.box(1, 1, 1), col, x, y + s / 2, z, { s, ry: (r() - .5) * .6 }); },
};

// ---- distant mountain range: a ridge curtain with depth, snow above `snow`, colours fade toward the horizon haze
function range(b, o){ const f = fbm1(o.seed), step = o.step || 5, cols = [], haze = new THREE.Color(o.haze), base = new THREE.Color(o.color), top = new THREE.Color(o.top || o.color), snow = new THREE.Color(o.snowColor || '#f4f8ff');
  const pos = [], col = [], rows = [0, .45, 1];
  for (let x = o.x0 ?? -340; x <= (o.x1 ?? 340); x += step){ const ridge = o.smooth ? f(x * o.freq, 4) : 1 - Math.abs(f(x * o.freq, 5) * 2 - 1); const h = o.base + o.height * Math.pow(Math.max(0, ridge - (o.cut || 0)) / (1 - (o.cut || 0)), o.pow || 1.4);
    cols.push(rows.map(t => { const y = h + (o.base - 20 - h) * t, z = o.z + t * (o.depth || 25) + (t > 0 && t < 1 ? (f(x * .07 + 9, 2) - .5) * 14 : 0); return [x + (t > 0 ? (f(x * .03 + 3, 2) - .5) * 6 : 0), y, z]; }).map(([X, Y, Z], ti) => {
      const k = Math.min(1, Math.max(0, (Y - (o.base - 20)) / Math.max(1, h - o.base + 20))); let c = base.clone().lerp(top, k); if (o.snow != null && Y > o.snow) c = c.lerp(snow, Math.min(1, (Y - o.snow) / 6));
      c.lerp(haze, (o.hazeAmt ?? .35) + (1 - k) * .45); return { p: [X, Y, Z], c }; })); }
  for (let i = 0; i < cols.length - 1; i++) for (let r = 0; r < rows.length - 1; r++){ const a = cols[i][r], bb = cols[i + 1][r], c = cols[i][r + 1], d = cols[i + 1][r + 1];
    for (const v of [a, c, bb, bb, c, d]){ pos.push(...v.p); col.push(v.c.r, v.c.g, v.c.b); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  (b.parts.get(o.mat || 'far') || b.parts.set(o.mat || 'far', []).get(o.mat || 'far')).push(g); }
// a city skyline with lit windows
function skyline(group, o, r){ const geos = [], cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) if (Math.random() < .45){ g.fillStyle = ['#ffd27a', '#fff1c0', '#7ad8ff', '#ffb070'][Math.floor(Math.random() * 4)]; g.fillRect(x, y, 4, 5); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter;
  for (let i = 0; i < o.count; i++){ const w = 6 + r() * 12, h = o.hmin + r() * (o.hmax - o.hmin), d = 6 + r() * 8, x = (r() - .5) * o.spread, z = o.z - r() * o.depth;
    const b = new THREE.BoxGeometry(w, h, d); const uv = b.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 8, uv.getY(k) * h / 16); b.translate(x, o.y + h / 2, z); geos.push(b); }
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: o.color, roughness: .8, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 1.6, map: null })); group.add(m); }

// ---- per-style worlds. ctx: { T, L, fy, top, solids, r, b, group, ambient, horizon }
const near = (ctx, x, z, minGap = 0) => { for (const [x0, x1] of ctx.solids) if (x > x0 - minGap && x < x1 + minGap && z > ctx.cz[1] - .5 && z < ctx.cz[0] + .5) return true; return false; };
function scatter(ctx, n, area, fn, opts = {}){ const r = ctx.r; for (let i = 0, tries = 0; i < n && tries < n * 6; tries++){ const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0);
    if (near(ctx, x, z, opts.gap ?? .5)) continue; if (opts.keepGap && x > ctx.gap[0] - 1 && x < ctx.gap[1] + 1 && z > -4 && z < 6) continue; fn(x, z); i++; } }
// spots on top of the cliffs, away from the breakable edges and out of the drawing plane
function cliffTops(ctx, n, fn){ const r = ctx.r; for (const [x0, x1, top] of ctx.solids){ const a = Math.max(x0, -30) + (x0 > -39 ? 2.8 : 0), b2 = Math.min(x1, 30) - (x1 < 39 ? 2.8 : 0); if (b2 <= a) continue;
    for (let i = 0; i < n; i++){ const x = a + r() * (b2 - a), z = r() < .5 ? ctx.cz[1] + .4 + r() * Math.max(.2, -ctx.cz[1] - 1.6) : 1.2 + r() * Math.max(.1, ctx.cz[0] - 1.6); fn(x, top, z); } } }
const W = {
  meadow(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 3, z: -230, base: fy - 2, height: 70, freq: .006, color: '#5d6f9a', top: '#8a96b8', snow: fy + 52, haze: ctx.horizon, hazeAmt: .45 });
    range(b, { seed: 8, z: -140, base: fy - 2, height: 22, freq: .012, smooth: true, color: '#3f7a3a', top: '#6aa052', haze: ctx.horizon, hazeAmt: .25, pow: 1 });
    scatter(ctx, 60, { x0: -70, x1: 70, z0: -110, z1: -22 }, (x, z) => (r() < .5 ? P.round : P.pine)(b, x, fy, z, 1.2 + r() * 1.2, r));
    scatter(ctx, 16, { x0: -40, x1: 40, z0: -14, z1: 8 }, (x, z) => P.bush(b, x, fy, z, 1 + r(), r), { keepGap: true });
    scatter(ctx, 260, { x0: -40, x1: 40, z0: -20, z1: 14 }, (x, z) => P.tuft(b, x, fy, z, 1 + r(), r));
    scatter(ctx, 18, { x0: -30, x1: 30, z0: -12, z1: 10 }, (x, z) => P.rock(b, x, fy, z, .4 + r() * .8, r, '#8a8478'));
    cliffTops(ctx, 18, (x, y, z) => P.tuft(b, x, y, z, .8, r)); cliffTops(ctx, 2, (x, y, z) => P.bush(b, x, y, z, .7, r));
    ctx.ambient.push({ type: 'pollen' }); },
  desert(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 5, z: -210, base: fy - 2, height: 46, freq: .01, color: '#a8503a', top: '#d07a4a', haze: ctx.horizon, hazeAmt: .4, cut: .35, pow: .35 });   // flat-topped mesas
    range(b, { seed: 9, z: -120, base: fy - 2, height: 26, freq: .02, color: '#b8603a', top: '#e08a50', haze: ctx.horizon, hazeAmt: .2, cut: .45, pow: .25 });
    scatter(ctx, 26, { x0: -70, x1: 70, z0: -100, z1: -22 }, (x, z) => P.cactus(b, x, fy, z, 1 + r() * .8, r));
    scatter(ctx, 40, { x0: -50, x1: 50, z0: -60, z1: 12 }, (x, z) => P.rock(b, x, fy, z, .4 + r() * 1.6, r, '#a8603a'), { keepGap: true });
    scatter(ctx, 10, { x0: -60, x1: 60, z0: -90, z1: -20 }, (x, z) => P.rock(b, x, fy, z, 3 + r() * 4, r, '#b06a42'));
    scatter(ctx, 50, { x0: -40, x1: 40, z0: -30, z1: 12 }, (x, z) => P.tuft(b, x, fy, z, .8, r, '#9a8a50'));
    ctx.ambient.push({ type: 'dust' }); },
  city(ctx){ const { b, r, fy, group } = ctx;
    skyline(group, { count: 50, z: -95, depth: 90, spread: 260, y: fy - 1, hmin: 14, hmax: 55, color: '#1a1e2c' }, r);
    skyline(group, { count: 40, z: -170, depth: 60, spread: 360, y: fy - 1, hmin: 25, hmax: 90, color: '#141828' }, r);
    for (let x = -60; x < 60; x += 9){ if (near(ctx, x, 9)) continue; P.streetlight(b, x, fy, 9); }
    for (let x = -60; x < 60; x += 3) b.add(G.box(1.4, .02, .18), '#d8d8c8', x, fy + .01, 4.2);           // lane markings
    scatter(ctx, 10, { x0: -50, x1: 50, z0: -20, z1: -6 }, (x, z) => { const w = 3 + r() * 3; b.add(G.box(w, 2 + r() * 2, 2.5), '#2a2e3a', x, fy + 1.2, z); });
    cliffTops(ctx, 2, (x, y, z) => { b.add(G.cyl(.9, .9, 1.6, 12), '#5a4a3a', x, y + 1.4, z - 1); b.add(G.cyl(.06, .06, 2, 5), '#3a3a3a', x + .6, y + 1, z - 1); });  // rooftop water tanks
    cliffTops(ctx, 3, (x, y, z) => b.add(G.cyl(.03, .03, 3, 4), '#9aa', x, y + 1.5, z)); },
  candy(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 4, z: -200, base: fy - 2, height: 40, freq: .01, smooth: true, color: '#ff9ad5', top: '#ffd0ec', haze: ctx.horizon, hazeAmt: .3, pow: 1.2 });
    range(b, { seed: 6, z: -120, base: fy - 2, height: 14, freq: .02, smooth: true, color: '#9ae8d0', top: '#c8fff0', haze: ctx.horizon, hazeAmt: .15, pow: 1 });
    scatter(ctx, 30, { x0: -70, x1: 70, z0: -100, z1: -22 }, (x, z) => (r() < .6 ? P.lollipop : P.cane)(b, x, fy, z, 1.2 + r(), r));
    scatter(ctx, 40, { x0: -45, x1: 45, z0: -40, z1: 12 }, (x, z) => P.gumdrop(b, x, fy, z, .4 + r() * .9, r), { keepGap: true });
    cliffTops(ctx, 3, (x, y, z) => P.gumdrop(b, x, y, z, .35, r));
    for (const [x0, x1, top] of ctx.solids){ const a = Math.max(x0, -30) + 2.8, e = Math.min(x1, 30) - 2.8; for (let x = a; x < e; x += .55 + r() * .4) b.add(G.sph(.22, 8, 6), '#fff4f9', x, top - .25 - r() * .5, ctx.cz[0] + .05, { sy: 1.6 + r() }); } },  // frosting drips
  arctic(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 2, z: -220, base: fy - 2, height: 85, freq: .007, color: '#6a7f9a', top: '#9fb2c8', snow: fy + 30, haze: ctx.horizon, hazeAmt: .35 });
    range(b, { seed: 7, z: -130, base: fy - 2, height: 35, freq: .015, color: '#8aa0b8', top: '#dfe8f2', snow: fy + 10, haze: ctx.horizon, hazeAmt: .2 });
    scatter(ctx, 50, { x0: -70, x1: 70, z0: -100, z1: -22 }, (x, z) => P.pine(b, x, fy, z, 1.1 + r() * 1.3, r, true));
    scatter(ctx, 26, { x0: -45, x1: 45, z0: -40, z1: 12 }, (x, z) => (r() < .5 ? P.icespike : P.rock)(b, x, fy, z, .5 + r() * 1.2, r, '#dfeaf4'), { keepGap: true });
    for (const [x0, x1, top] of ctx.solids){ const a = Math.max(x0, -30) + 2.8, e = Math.min(x1, 30) - 2.8; for (let x = a; x < e; x += .35 + r() * .5) b.add(G.cone(.08 + r() * .08, .5 + r() * 1.2, 5), '#d8f2ff', x, top - .9 - r() * .3, ctx.cz[0] + .1, { rx: Math.PI }); }   // icicles
    ctx.ambient.push({ type: 'snow' }); },
  jungle(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 12, z: -200, base: fy - 2, height: 60, freq: .012, smooth: true, color: '#2f5a3a', top: '#4f8050', haze: ctx.horizon, hazeAmt: .4, pow: 1.6 });
    range(b, { seed: 13, z: -110, base: fy - 2, height: 24, freq: .025, smooth: true, color: '#2a5030', top: '#3f7040', haze: ctx.horizon, hazeAmt: .2, pow: 1.2 });
    scatter(ctx, 70, { x0: -70, x1: 70, z0: -100, z1: -22 }, (x, z) => (r() < .45 ? P.palm(b, x, fy, z, 1.3 + r() * 1.3, r) : P.round(b, x, fy, z, 1.3 + r() * 1.3, r, ['#2f6a2a', '#3f7a30', '#2a5a28'])));
    scatter(ctx, 40, { x0: -45, x1: 45, z0: -30, z1: 12 }, (x, z) => P.bush(b, x, fy, z, 1 + r() * 1.2, r, ['#2f6a2a', '#3f8a38']), { keepGap: true });
    scatter(ctx, 200, { x0: -40, x1: 40, z0: -24, z1: 14 }, (x, z) => P.tuft(b, x, fy, z, 1.2, r, '#3f7a30'));
    scatter(ctx, 8, { x0: -40, x1: 40, z0: -30, z1: -10 }, (x, z) => P.column(b, x, fy, z, 1, 2 + r() * 4, '#8a8f7a', r() < .6));
    cliffTops(ctx, 16, (x, y, z) => P.tuft(b, x, y, z, 1, r, '#3f8a30')); cliffTops(ctx, 3, (x, y, z) => P.bush(b, x, y, z, .8, r, ['#2f6a2a', '#3f8a38']));
    for (const [x0, x1, top] of ctx.solids){ const a = Math.max(x0, -30) + 2.8, e = Math.min(x1, 30) - 2.8; for (let x = a; x < e; x += .5 + r() * 1.2){ const len = 1 + r() * 4; b.add(G.cyl(.035, .035, len, 4), '#3f7a2a', x, top - len / 2, ctx.cz[0] + .15, { rz: (r() - .5) * .1 }); for (let k = 0; k < len; k += .4) b.add(G.sph(.1, 5, 4), '#4f9a38', x + (r() - .5) * .1, top - k, ctx.cz[0] + .18); } }  // hanging vines
    ctx.ambient.push({ type: 'fireflies' }); },
  factory(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 21, z: -210, base: fy - 2, height: 30, freq: .01, smooth: true, color: '#4a505c', top: '#6a707c', haze: ctx.horizon, hazeAmt: .45 });
    const stacks = [];
    for (let i = 0; i < 9; i++){ const x = (r() - .5) * 140, z = -40 - r() * 90, h = 16 + r() * 22; if (near(ctx, x, z)) continue; P.chimney(b, x, fy, z, 1, h); stacks.push([x, fy + h + .5, z]); }
    scatter(ctx, 8, { x0: -60, x1: 60, z0: -60, z1: -14 }, (x, z) => P.tank(b, x, fy, z, .8 + r() * .5));
    scatter(ctx, 12, { x0: -60, x1: 60, z0: -100, z1: -20 }, (x, z) => { const w = 10 + r() * 14, h = 6 + r() * 8; b.add(G.box(w, h, 8), '#6a707a', x, fy + h / 2, z); b.add(G.box(w + .4, .5, 8.4), '#4a4f58', x, fy + h, z); });
    for (const [x0, x1, top] of ctx.solids){ const a = Math.max(x0, -30) + .2, e = Math.min(x1, 30) - .2; if (e - a < 1) continue; for (const yy of [top - 3.2, top - 4.4]) b.add(G.cyl(.18, .18, e - a, 8), '#8a6a40', (a + e) / 2, yy, ctx.cz[0] + .25, { rz: Math.PI / 2 }); }  // pipes on the cliff faces
    scatter(ctx, 30, { x0: -40, x1: 40, z0: -20, z1: 12 }, (x, z) => b.add(G.box(.8, .8, .8), r() < .5 ? '#8a5a2a' : '#4a6a8a', x, fy + .4, z, { ry: r() * 3 }), { keepGap: true });
    ctx.ambient.push(...stacks.map(p => ({ type: 'chimney', p }))); },
  toys(ctx){ const { b, r, fy } = ctx, cols = ['#e03a2a', '#ffd21f', '#3a7be0', '#3ab05a', '#ff8a1f', '#a04ae0'];
    scatter(ctx, 30, { x0: -70, x1: 70, z0: -90, z1: -24 }, (x, z) => { let y = fy; const n = 1 + Math.floor(r() * 4), s = 2 + r() * 3; for (let i = 0; i < n; i++){ P.block(b, x + (r() - .5) * .4, y, z, s, cols[Math.floor(r() * 6)], r); y += s; } });
    scatter(ctx, 10, { x0: -60, x1: 60, z0: -80, z1: -30 }, (x, z) => { const L = 12 + r() * 8, c = cols[Math.floor(r() * 6)]; b.add(G.cyl(.8, .8, L, 6), c, x, fy + L / 2 * .9, z, { rz: .35 }); b.add(G.cone(.8, 2, 6), '#e8c89a', x - Math.sin(.35) * (L / 2 + 1), fy + .2, z, { rz: .35 + Math.PI }); });
    scatter(ctx, 14, { x0: -40, x1: 40, z0: -30, z1: 12 }, (x, z) => b.add(G.sph(.6 + r() * .6, 14, 10), cols[Math.floor(r() * 6)], x, fy + .6, z), { keepGap: true });
    scatter(ctx, 20, { x0: -40, x1: 40, z0: -30, z1: 12 }, (x, z) => P.block(b, x, fy, z, .7 + r() * .6, cols[Math.floor(r() * 6)], r), { keepGap: true }); },
  synth(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 31, z: -190, base: fy - 2, height: 40, freq: .02, color: '#1a0830', top: '#2a0a48', haze: '#2a0a48', hazeAmt: 0, mat: 'wire' });
    range(b, { seed: 31, z: -190.5, base: fy - 2, height: 40, freq: .02, color: '#0a0418', top: '#120624', haze: '#0a0418', hazeAmt: 0 });
    scatter(ctx, 22, { x0: -80, x1: 80, z0: -100, z1: -26 }, (x, z) => P.palm(b, x, fy, z, 1.4 + r(), r, '#120424')); },
  temple(ctx){ const { b, r, fy } = ctx;
    range(b, { seed: 41, z: -220, base: fy - 2, height: 55, freq: .008, smooth: true, color: '#6a7a6a', top: '#9aa890', haze: ctx.horizon, hazeAmt: .45, pow: 1.3 });
    range(b, { seed: 42, z: -120, base: fy - 2, height: 20, freq: .018, smooth: true, color: '#7a8a50', top: '#a8b070', haze: ctx.horizon, hazeAmt: .2, pow: 1 });
    scatter(ctx, 30, { x0: -70, x1: 70, z0: -100, z1: -26 }, (x, z) => (r() < .6 ? P.cypress : P.round)(b, x, fy, z, 1.2 + r(), r, ['#6a8a4a', '#7a9a58']));
    for (let i = 0; i < 6; i++){ const x = -24 + i * 4.5, z = -34; if (!near(ctx, x, z)) P.column(b, x, fy, z, 1.4, 6, '#f2efe8', i === 4); } b.add(G.box(26, 1, 4), '#ece8e0', -12.75, fy + 9.2 * 1.0 + .5, -34);   // a ruined colonnade
    scatter(ctx, 12, { x0: -40, x1: 40, z0: -30, z1: 12 }, (x, z) => P.column(b, x, fy, z, .7, .6 + r() * 1.5, '#ece8e0', true), { keepGap: true });
    scatter(ctx, 120, { x0: -40, x1: 40, z0: -24, z1: 14 }, (x, z) => P.tuft(b, x, fy, z, 1, r, '#8a9a50'));
    for (const [x0, x1, top] of ctx.solids){ const a = Math.max(x0, -30) + 2.9, e = Math.min(x1, 30) - 2.9; for (let x = a; x < e; x += 2.2){ const h = top - .35 - (ctx.fy + .3); if (h > 1) P.column(b, x, ctx.fy, ctx.cz[0] + .4, .55, h / .55 - .6, '#f4f2ee'); } }   // pilasters on the cliff face
    ctx.ambient.push({ type: 'pollen' }); },
};

export function buildWorld(T, L, terr, fy, cz, horizon){
  const group = new THREE.Group(), b = new Batch(), ambient = [], solids = L.solids.map(s => s.slice());
  const gaps = []; const ss = solids.slice().sort((a, c) => a[0] - c[0]); for (let i = 0; i < ss.length - 1; i++) gaps.push([ss[i][1], ss[i + 1][0]]);
  const ctx = { T, L, fy, cz, solids, r: RNG(77), b, group, ambient, horizon, gap: gaps.length ? [Math.min(...gaps.map(g => g[0])), Math.max(...gaps.map(g => g[1]))] : [0, 0] };
  (W[T.env?.build] || W.meadow)(ctx);
  const mats = { std: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, flatShading: true }), far: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), wire: new THREE.MeshBasicMaterial({ color: '#ff2fd0', wireframe: true, transparent: true, opacity: .8, toneMapped: false }) };
  b.build(group, mats);
  return { group, ambient };
}
