// Physics for one run, powered by Jolt (WASM). The car and the drawings move in the drawing plane; rocks, shards and
// wreckage fly around in full 3D. Single-threaded WASM is bit-for-bit deterministic, so the same level + strokes +
// materials always give the same run — that is what lets a liked run be replayed exactly for the video.
import JoltInit from '../vendor/jolt/jolt-physics.wasm.js';
export const DT = 1 / 60;
let J = null;
export async function initPhysics(){ if (!J) J = await JoltInit(typeof window !== 'undefined' ? { locateFile: f => new URL('../vendor/jolt/' + f, import.meta.url).href } : {}); return J; }

// ---- tuning
const EDGE = 2.4, DEPTH = 2.4, BLK = .6;          // breakable blocks along every open cliff edge
const HAZ_DMG = { saw: 45, spike: 30, bullet: 24 };
const MAX_ROCKS = 70, BLOCK_J = 1500;               // impulse (kg·m/s) that cracks a cliff block

// ---- what you can draw with. density kg/m³, F = force (N) a joint takes before it snaps, T = bending torque (N·m)
export const MATERIALS = {
  marker: { name: 'Marker', icon: '🖊️', density: 320, friction: .9, restitution: 0,  F: 60000, T: 26000 },
  wood:   { name: 'Wood',   icon: '🪵', density: 260, friction: .85, restitution: .05, F: 24000, T: 8000, splinter: true },
  steel:  { name: 'Steel',  icon: '🔩', density: 900, friction: .5, restitution: .02, F: 260000, T: 120000, metal: true },
  rubber: { name: 'Rubber', icon: '🛞', density: 380, friction: 1.3, restitution: .8, F: 90000, spring: 2.2, damp: .12 },
  glass:  { name: 'Glass',  icon: '🔷', density: 520, friction: .35, restitution: .1, F: 30000, T: 16000, shatter: 4.5 },
  ice:    { name: 'Ice',    icon: '❄️', density: 330, friction: .02, restitution: .05, F: 22000, T: 7000, shatter: 9 },
  rope:   { name: 'Rope',   icon: '🪢', density: 260, friction: 1.1, restitution: 0, F: 120000, free: true, seg: .32, thick: .09 },
};
export const MATERIAL_IDS = Object.keys(MATERIALS);
export const INK_DEPTH = 1.5;
// a stroke becomes a chain of straight pieces joined end to end
export function segmentize(stroke, mat = 'marker'){ const M = MATERIALS[mat] || MATERIALS.marker, step = M.seg || (M.spring ? .45 : .8), out = [];
  if (stroke.length < 2 || inkLength([stroke]) < .08){ const [x, y] = stroke[0]; return [[x - .1, y, x + .1, y]]; }
  let ax = stroke[0][0], ay = stroke[0][1], acc = 0;
  for (let i = 1; i < stroke.length; i++){ let [px, py] = stroke[i - 1]; const [qx, qy] = stroke[i]; let L = Math.hypot(qx - px, qy - py);
    while (acc + L >= step){ const k = (step - acc) / L, nx = px + (qx - px) * k, ny = py + (qy - py) * k; out.push([ax, ay, nx, ny]); ax = nx; ay = ny; px = nx; py = ny; L = Math.hypot(qx - px, qy - py); acc = 0; }
    acc += L; }
  const [lx, ly] = stroke[stroke.length - 1]; if (Math.hypot(lx - ax, ly - ay) > .05) out.push([ax, ay, lx, ly]); else if (out.length) out[out.length - 1][2] = lx, out[out.length - 1][3] = ly; else out.push([ax, ay, lx, ly]);
  return out; }

const lowest = level => Math.min(...level.solids.map(s => s[2]));
export const floorY = level => level.floor === null ? null : (level.floor ?? lowest(level) - 9);

// ---- terrain layout, shared by physics and rendering: each tower = solid core + breakable blocks on its open edges
export function terrain(level){
  return level.solids.map(([x0, x1, top]) => {
    const w = x1 - x0, openL = x0 > -39, openR = x1 < 39;
    const eL = openL ? Math.min(EDGE, w / (openR ? 2 : 1)) : 0, eR = openR ? Math.min(EDGE, w / (openL ? 2 : 1)) : 0;
    const blocks = [], rows = Math.round(DEPTH / BLK), bh = DEPTH / rows;
    const zone = (a, b) => { const cols = Math.max(1, Math.round((b - a) / BLK)), bw = (b - a) / cols;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) blocks.push({ x: a + (c + .5) * bw, y: top - (r + .5) * bh, w: bw, h: bh, top: r === 0 }); };
    if (eL) zone(x0, x0 + eL); if (eR) zone(x1 - eR, x1);
    const core = [{ x0, x1, y0: top - 50, y1: top - DEPTH }];
    if (x1 - eR > x0 + eL + 1e-3) core.push({ x0: x0 + eL, x1: x1 - eR, y0: top - DEPTH, y1: top, cap: true });
    return { x0, x1, top, openL, openR, blocks, core };
  });
}

// Points drawn "inside" a cliff are pushed out to its nearest face, so what you see is exactly what the physics gets.
export function fitPoint(level, x, y){
  for (const [x0, x1, top] of level.solids){
    if (x > x0 - .1 && x < x1 + .1 && y < top + .1){
      const dT = top + .1 - y, dL = x0 > -39 ? x - (x0 - .1) : 1e9, dR = x1 < 39 ? x1 + .1 - x : 1e9, m = Math.min(dT, dL, dR);
      if (m === dT) y = top + .1; else if (m === dL) x = x0 - .1; else x = x1 + .1; } }
  const f = floorY(level); if (f != null && y < f + .1) y = f + .1;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

export function createSim(level, rawStrokes, opts = {}){
  if (!J) throw new Error('call initPhysics() first');
  const mats = rawStrokes.map((_, i) => MATERIALS[(opts.mats || [])[i]] ? opts.mats[i] : 'marker');
  const zf = opts.zf ?? 2.5, zb = opts.zb ?? -2.5;
  let seed = 20240917; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let ev = [];
  const trash = []; const T_ = o => (trash.push(o), o);
  const V = (x, y, z) => T_(new J.Vec3(x, y, z)), RV = (x, y, z) => T_(new J.RVec3(x, y, z)), Qz = a => T_(new J.Quat(0, 0, Math.sin(a / 2), Math.cos(a / 2)));

  // ---- world
  const NM = 0, MV = 1, settings = new J.JoltSettings(), opf = new J.ObjectLayerPairFilterTable(2); opf.EnableCollision(NM, MV); opf.EnableCollision(MV, MV);
  const bpi = new J.BroadPhaseLayerInterfaceTable(2, 2); bpi.MapObjectToBroadPhaseLayer(NM, new J.BroadPhaseLayer(0)); bpi.MapObjectToBroadPhaseLayer(MV, new J.BroadPhaseLayer(1));
  settings.mObjectLayerPairFilter = opf; settings.mBroadPhaseLayerInterface = bpi; settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(bpi, 2, opf, 2);
  const jolt = new J.JoltInterface(settings); J.destroy(settings);
  const sys = jolt.GetPhysicsSystem(), bi = sys.GetBodyInterface(); sys.SetGravity(V(0, -10, 0));
  const infos = [], P2 = J.EAllowedDOFs_Plane2D;
  // create a body; info is our bookkeeping object, reachable from contacts through the body's user data
  function mk(shape, x, y, z, q, motion, info, o = {}){ const cs = new J.BodyCreationSettings(shape, RV(x, y, z), q || Qz(0), motion, motion === J.EMotionType_Static ? NM : MV);
    cs.mFriction = o.friction ?? .8; cs.mRestitution = o.restitution ?? 0; if (o.plane) cs.mAllowedDOFs = P2; if (o.mass){ cs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia; cs.mMassPropertiesOverride.mMass = o.mass; }
    if (o.bullet) cs.mMotionQuality = J.EMotionQuality_LinearCast; if (o.convertible) cs.mAllowDynamicOrKinematic = true; if (o.group) cs.mCollisionGroup = o.group; cs.mAngularDamping = o.angDamp ?? .05; cs.mLinearDamping = o.linDamp ?? .02;
    info.idx = infos.length; infos.push(info); cs.mUserData = info.idx; const b = bi.CreateBody(cs); J.destroy(cs); bi.AddBody(b.GetID(), J.EActivation_Activate); info.b = b; info.id = b.GetID(); return b; }
  const box = (hx, hy, hz, density) => { const s = new J.BoxShape(V(hx, hy, hz), Math.min(.02, hx * .4, hy * .4, hz * .4)); if (density) s.SetDensity(density); return s; };
  const hull = (pts, density, fb) => { const ss = (new J.ConvexHullShapeSettings()); for (const [x, y, z] of pts) ss.mPoints.push_back(V(x, y, z)); ss.mMaxConvexRadius = .01; if (density) ss.mDensity = density; const r = ss.Create(); return r.IsValid() ? r.Get() : fb(); };
  const compound = parts => { const ss = (new J.StaticCompoundShapeSettings()); for (const [shapeSettings, x, y, a] of parts) ss.AddShape(V(x, y, 0), Qz(a), shapeSettings, 0); return ss.Create().Get(); };
  // a hinge around the z axis (the drawing plane's normal); `lock` makes it rigid, `spring` makes it bendy
  function hinge(b1, b2, x, y, o = {}){ const s = (new J.HingeConstraintSettings()); s.mPoint1 = RV(x, y, 0); s.mPoint2 = RV(x, y, 0); s.mHingeAxis1 = V(0, 0, 1); s.mHingeAxis2 = V(0, 0, 1); s.mNormalAxis1 = V(1, 0, 0); s.mNormalAxis2 = V(1, 0, 0);
    if (o.lock || o.spring){ s.mLimitsMin = 0; s.mLimitsMax = 0; if (o.spring){ s.mLimitsSpringSettings.mFrequency = o.spring; s.mLimitsSpringSettings.mDamping = o.damp ?? .2; } }
    if (o.motor){ s.mMotorSettings.mMaxTorqueLimit = o.motor; s.mMotorSettings.mMinTorqueLimit = -o.motor; }
    const c = J.castObject(s.Create(b1, b2), J.HingeConstraint); c.SetNumVelocityStepsOverride(30); c.SetNumPositionStepsOverride(10); sys.AddConstraint(c); return c; }

  // ---- terrain: solid cores + breakable blocks, as deep as the style's cliffs
  const TR = terrain(level), blocks = [], low = lowest(level), FLOOR = floorY(level), zc = (zf + zb) / 2, hz = (zf - zb) / 2;
  const ground = { kind: 'stone' };
  for (const t of TR){
    for (const c of t.core) mk(box((c.x1 - c.x0) / 2, (c.y1 - c.y0) / 2, hz), (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, zc, null, J.EMotionType_Static, ground === null ? {} : Object.assign({}, ground, { kind: 'stone' }), { friction: .9 });
    for (const b of t.blocks){ const o = { kind: 'block', b, broken: false }; mk(box(b.w / 2 - .004, b.h / 2 - .004, hz, 2400), b.x, b.y, zc, null, J.EMotionType_Static, o, { friction: .9, convertible: true }); blocks.push(o); } }
  if (FLOOR != null) mk(box(80, 5, 40), 0, FLOOR - 5, 0, null, J.EMotionType_Static, { kind: 'stone' }, { friction: .9 });
  const cores = infos.filter(i => i.kind === 'stone');

  // ---- the drawing: each stroke is a chain of pieces; pieces touching a cliff are pinned to it, crossing strokes join
  const strokes = rawStrokes.map(s => s.map(p => fitPoint(level, p[0], p[1])));
  const ink = [], joints = [];
  strokes.forEach((s, si) => { const M = MATERIALS[mats[si]], segs = segmentize(s, mats[si]), th = (M.thick || .14) / 2, filt = (new J.GroupFilterTable(segs.length + 1));
    for (let i = 0; i < segs.length - 1; i++) filt.DisableCollision(i, i + 1);
    const pieces = segs.map(([x0, y0, x1, y1], i) => { const L = Math.max(.06, Math.hypot(x1 - x0, y1 - y0)), a = Math.atan2(y1 - y0, x1 - x0), sh = box(L / 2, th, INK_DEPTH / 2, M.density);
      const o = { kind: 'ink', mat: mats[si], stroke: si, seg: i, ends: [[x0, y0], [x1, y1]], alive: true };
      mk(sh, (x0 + x1) / 2, (y0 + y1) / 2, 0, Qz(a), J.EMotionType_Dynamic, o, { plane: true, friction: M.friction, restitution: M.restitution, group: (new J.CollisionGroup(filt, si + 1, i)) }); ink.push(o); return o; });
    for (let i = 0; i < pieces.length - 1; i++){ const [x, y] = pieces[i].ends[1]; joints.push({ c: hinge(pieces[i].b, pieces[i + 1].b, x, y, { lock: !M.free && !M.spring, spring: M.spring, damp: M.damp }), F: M.F, T: M.T, x, y, mat: mats[si], a: pieces[i], z: pieces[i + 1] }); }
    // pin to the cliffs: first and last touching points
    const touch = []; pieces.forEach(pc => pc.ends.forEach(e => { if (surfDist(e[0], e[1]) < .3) touch.push([pc, e]); }));
    if (touch.length){ const pick = [touch[0]], last = touch[touch.length - 1]; if (Math.hypot(last[1][0] - touch[0][1][0], last[1][1] - touch[0][1][1]) > .8) pick.push(last);
      for (const [pc, [x, y]] of pick){ const tb = anchorBody(x, y); joints.push({ c: hinge(tb.b, pc.b, x, y, { lock: !M.free }), F: M.F * 1.2, T: (M.T || 1e9) * 1.2, x, y, mat: mats[si], a: tb, z: pc, anchor: true }); } } });
  function surfDist(x, y){ let d = 1e9; for (const s of TR){ const dx = Math.max(s.x0 - x, 0, x - s.x1), dy = Math.max(0, y - s.top); d = Math.min(d, Math.hypot(dx, dy)); } if (FLOOR != null) d = Math.min(d, y - FLOOR); return d; }
  function anchorBody(x, y){ let best = null, bd = .45; for (const o of blocks){ const b = o.b, d = Math.hypot(Math.max(Math.abs(x - b.x) - b.w / 2, 0), Math.max(Math.abs(y - b.y) - b.h / 2, 0)); if (d < bd){ bd = d; best = o; } }
    if (best) return best; let bc = cores[0], bcd = 1e9; for (const c of cores){ const p = c.b.GetPosition(), d = Math.abs(p.GetY() - y) + Math.abs(p.GetX() - x) * .01; if (d < bcd){ bcd = d; bc = c; } } return bc; }
  // crossing strokes are joined where they meet (the weaker material decides the strength)
  for (let a = 0; a < ink.length; a++) for (let b = a + 1; b < ink.length; b++){ const A = ink[a], B = ink[b]; if (A.stroke === B.stroke) continue;
    if (joints.some(j => j.link && ((j.a.stroke === A.stroke && j.z.stroke === B.stroke)))) continue;
    for (const e of B.ends){ const [p0, p1] = A.ends, vx = p1[0] - p0[0], vy = p1[1] - p0[1], k = Math.max(0, Math.min(1, ((e[0] - p0[0]) * vx + (e[1] - p0[1]) * vy) / (vx * vx + vy * vy || 1)));
      if (Math.hypot(p0[0] + vx * k - e[0], p0[1] + vy * k - e[1]) < .2){ const MA = MATERIALS[A.mat], MB = MATERIALS[B.mat];
        joints.push({ c: hinge(A.b, B.b, e[0], e[1], { lock: !(MA.free || MB.free) }), F: Math.min(MA.F, MB.F), T: Math.min(MA.T || 1e9, MB.T || 1e9), x: e[0], y: e[1], mat: A.mat, a: A, z: B, link: true }); break; } } }

  // ---- the car: chassis + cabin (pinned, can be knocked off) + two motorised wheels
  const [cx, cy] = level.car, carInfo = { kind: 'car' }, cabInfo = { kind: 'car' };
  const car = mk(box(.85, .22, .55), cx, cy - .05, 0, null, J.EMotionType_Dynamic, carInfo, { plane: true, mass: 200, friction: .4 });
  const cabin = mk(box(.45, .16, .5), cx - .1, cy + .34, 0, null, J.EMotionType_Dynamic, cabInfo, { plane: true, mass: 30, friction: .4 });
  let cabinJ = hinge(car, cabin, cx - .1, cy + .2, { lock: true });
  const wheelShape = (new J.RotatedTranslatedShapeSettings(V(0, 0, 0), T_(new J.Quat(Math.SQRT1_2, 0, 0, Math.SQRT1_2)), (new J.CylinderShapeSettings(.5, .3, .03)))).Create().Get();
  const wheels = [-.55, .55].map(dx => { const info = { kind: 'wheel' }, w = mk(wheelShape, cx + dx, cy - .37, 0, null, J.EMotionType_Dynamic, info, { plane: true, mass: 22, friction: 1.4, angDamp: .02 });
    const c = hinge(car, w, cx + dx, cy - .37, { motor: 900 }); c.SetMotorState(J.EMotorState_Velocity); c.SetTargetAngularVelocity(0); return { w, c, on: true, info }; });
  const carBodies = () => [car, cabin, ...wheels.map(o => o.w)];
  const isCar = u => u && (u.kind === 'car' || u.kind === 'wheel');

  // ---- hazards
  const hz2 = (level.hazards || []).map(h => {
    if (h.type === 'spinner'){ const parts = [[(new J.SphereShapeSettings(.55)), 0, 0, 0]];
      for (let k = 0; k < h.arms; k++){ const a = k / h.arms * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); parts.push([(new J.BoxShapeSettings(V(h.len / 2, .14, .25), .02)), c * h.len / 2, s * h.len / 2, a]);
        const tip = (new J.ConvexHullShapeSettings()); for (const [px, py] of [[0, .3], [.55, 0], [0, -.3]]) for (const pz of [-.2, .2]) tip.mPoints.push_back(V(px, py, pz)); parts.push([tip, c * h.len, s * h.len, a]); }
      const info = { kind: 'metal', hz: 'spike' }; mk(compound(parts), h.x, h.y, 0, null, J.EMotionType_Kinematic, info, { friction: .3, restitution: .4 }); return { h, info, bullets: [], next: h.shots ? h.shots.first : 1e9, ang: 0 }; }
    if (h.type === 'saw'){ const parts = [[(new J.RotatedTranslatedShapeSettings(V(0, 0, 0), T_(new J.Quat(Math.SQRT1_2, 0, 0, Math.SQRT1_2)), (new J.CylinderShapeSettings(.08, h.r * .82, .02)))), 0, 0, 0]];
      for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, tooth = (new J.ConvexHullShapeSettings()); for (const [px, py] of [[h.r * .78, -.12], [h.r * 1.12, .02], [h.r * .78, .14]]) for (const pz of [-.06, .06]) tooth.mPoints.push_back(V(px, py, pz)); parts.push([tooth, 0, 0, a]); }
      const info = { kind: 'metal', hz: 'saw' }; mk(compound(parts), h.path[0][0], h.path[0][1], 0, null, J.EMotionType_Kinematic, info, { friction: .2, restitution: .5 }); return { h, info, ang: 0 }; }
    return { h }; });
  const bulletShape = (() => { const ss = (new J.ConvexHullShapeSettings()); for (const [x, y] of [[-.09, -.28], [.09, -.28], [0, .34]]) for (const z of [-.09, .09]) ss.mPoints.push_back(V(x, y, z)); ss.mMaxConvexRadius = .01; return ss.Create().Get(); })();

  // ---- debris (rocks, car panels, glass/ice shards, splinters): full 3D
  const debris = [];
  function spawnDebris(kind, x, y, z, size, kick, mat){ if (kind === 1 && debris.filter(d => !d.gone && d.k === 1).length >= MAX_ROCKS) return; const pts = [];
    const flat = kind === 2 ? .25 : kind === 3 ? .3 : 1, n = kind === 0 ? 0 : 7; for (let i = 0; i < n; i++) pts.push([(rnd() - .5) * 2 * size, (rnd() - .5) * 2 * size * flat, (rnd() - .5) * 2 * size * (kind === 3 ? 3 : 1)]);
    const sh = kind === 0 ? box(size, size * .35, size * .8, 1200) : kind === 2 ? box(size, size * .22, size * .9, 2000) : kind === 3 ? box(size * .45, size * .3, size * 2.2, 700) : hull(pts, 2400, () => box(size * .8, size * .6, size * .8, 2400));
    const info = { kind: kind === 1 ? 'rock' : kind === 0 ? 'panel' : 'shard', mat }; const q0 = T_(new J.Quat(rnd() - .5, rnd() - .5, rnd() - .5, 1)), q = T_(q0.Normalized());
    const b = mk(sh, x, y, z, q, J.EMotionType_Dynamic, info, { friction: .7, restitution: .2 }); const a = rnd() * Math.PI * 2;
    bi.SetLinearVelocity(info.id, V(Math.cos(a) * kick * rnd(), Math.abs(Math.sin(a)) * kick * rnd() + 1, (rnd() - .5) * kick)); bi.SetAngularVelocity(info.id, V((rnd() - .5) * 18, (rnd() - .5) * 18, (rnd() - .5) * 18));
    debris.push({ info, k: kind, s: size, mat }); }
  function breakBlock(o, sx, sy, kick){ if (o.broken) return; o.broken = true; o.kind = 'rock'; bi.SetObjectLayer(o.id, MV); bi.SetMotionType(o.id, J.EMotionType_Dynamic, J.EActivation_Activate);
    const p = o.b.GetPosition(), x = p.GetX(), y = p.GetY(), dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy) || 1; bi.SetLinearVelocity(o.id, V(dx / d * kick * .4, dy / d * kick * .4 + .5, (rnd() - .5) * kick * .5)); bi.SetAngularVelocity(o.id, V((rnd() - .5) * 3, (rnd() - .5) * 3, (rnd() - .5) * 3));
    for (let i = 0; i < 3; i++) spawnDebris(1, x + (rnd() - .5) * o.b.w, y + (rnd() - .5) * o.b.h, (rnd() - .5) * hz * 1.6, .07 + rnd() * .1, kick * .8);
    // anything pinned to this block is now pinned to a falling rock — that is the point
    ev.push(['crumble', x, y, Math.min(1, kick / 8)]); }
  function killInk(o, why){ if (!o.alive) return; o.alive = false; o.gone = true; for (const j of joints) if (!j.dead && (j.a === o || j.z === o)){ sys.RemoveConstraint(j.c); j.dead = true; }
    const p = o.b.GetPosition(), x = p.GetX(), y = p.GetY(), M = MATERIALS[o.mat], L = Math.hypot(o.ends[1][0] - o.ends[0][0], o.ends[1][1] - o.ends[0][1]); bi.RemoveBody(o.id);
    for (let i = 0; i < Math.max(2, Math.round(L * 7)); i++) spawnDebris(M.splinter ? 3 : 2, x + (rnd() - .5) * L, y, (rnd() - .5) * INK_DEPTH, .05 + rnd() * .06, 2.5, o.mat);
    ev.push([why, x, y, o.mat]); }

  // ---- contacts: Jolt calls back during the step; we only record, and act afterwards
  const hits = [], cl = new J.ContactListenerJS();
  cl.OnContactValidate = () => J.ValidateResult_AcceptAllContactsForThisBodyPair;
  cl.OnContactAdded = (p1, p2, pm) => { const b1 = J.wrapPointer(p1, J.Body), b2 = J.wrapPointer(p2, J.Body), m = J.wrapPointer(pm, J.ContactManifold), n = m.mWorldSpaceNormal, cp = m.GetWorldSpaceContactPointOn1(0);
    const px = cp.GetX(), py = cp.GetY(), pz = cp.GetZ(), nx = n.GetX(), ny = n.GetY(), nz = n.GetZ(), vel = b => { const v = b.GetLinearVelocity(), w = b.GetAngularVelocity(), c = b.GetCenterOfMassPosition(), rx = px - c.GetX(), ry = py - c.GetY(), rz = pz - c.GetZ();
      return [v.GetX() + w.GetY() * rz - w.GetZ() * ry, v.GetY() + w.GetZ() * rx - w.GetX() * rz, v.GetZ() + w.GetX() * ry - w.GetY() * rx]; };
    const va = vel(b1), vb = vel(b2), vn = Math.abs((vb[0] - va[0]) * nx + (vb[1] - va[1]) * ny + (vb[2] - va[2]) * nz), ia = infos[b1.GetUserData()], ib = infos[b2.GetUserData()];
    const im = b => { const mp = b.GetMotionProperties(); return b.IsStatic() || b.IsKinematic() ? 0 : mp.GetInverseMass(); }, ma = im(b1), mb = im(b2), red = ma + mb > 0 ? 1 / (ma + mb) : 0;
    hits.push({ ua: ia, ub: ib, x: px, y: py, v: vn, J: vn * red }); };
  cl.OnContactPersisted = () => {}; cl.OnContactRemoved = () => {};
  sys.SetContactListener(cl);
  const MAT = { car: 'metal', wheel: 'tire', ink: 'ink', block: 'stone', stone: 'stone', rock: 'rock', metal: 'metal', bullet: 'metal', panel: 'metal', shard: 'glass' };
  const sound = u => u.kind === 'ink' || u.kind === 'shard' ? (MATERIALS[u.mat]?.metal ? 'metal' : u.mat === 'glass' || u.mat === 'ice' ? 'glass' : u.mat === 'rubber' ? 'tire' : 'ink') : MAT[u.kind] || 'stone';

  let t = 0, hp = 100, fire = false, fireAt = -1, exploded = false, boomAt = -1, won = false, wonAt = -1, fellAt = -1, prog = { x: -1e9, y: 1e9, t: 0 }, prevV = null, ended = null;
  const prevVs = new Map(), hzCool = {};
  function damage(d, x, y){ if (exploded || d <= 0) return; hp -= d; if (d >= 6) ev.push(['dent', Math.min(1, d / 40), x, y]); }
  const pos = b => { const p = b.GetPosition(); return [p.GetX(), p.GetY(), p.GetZ()]; };
  function explode(x, y){ exploded = true; boomAt = t; hp = 0; ev.push(['boom', x, y]);
    wheels.forEach(o => { if (o.on){ sys.RemoveConstraint(o.c); o.on = false; } }); if (cabinJ){ sys.RemoveConstraint(cabinJ); cabinJ = null; }
    for (let i = 0; i < 9; i++) spawnDebris(0, x + (rnd() - .5) * .9, y + rnd() * .4, (rnd() - .5) * .8, .1 + rnd() * .12, 8);
    for (const o of infos){ if (!o.b || o.gone || o.kind === 'stone' || (o.kind === 'block' && !o.broken)) continue; const b = o.b; if (b.IsStatic() || b.IsKinematic()) continue;
      const [px, py, pz] = pos(b), dx = px - x, dy = py - y, d = Math.hypot(dx, dy, pz); if (d > 3.5 || d < 1e-3) continue; const m = 1 / Math.max(1e-6, b.GetMotionProperties().GetInverseMass()), k = (1 - d / 3.5) * 8 * m;
      bi.AddImpulse(o.id, V(dx / d * k, (dy / d + .5) * k, pz / d * k)); }
    for (const o of blocks) if (!o.broken && Math.hypot(o.b.x - x, o.b.y - y) < 1.9) breakBlock(o, x, y, 7);
    for (const j of joints) if (!j.dead && Math.hypot(j.x - x, j.y - y) < 2.5){ sys.RemoveConstraint(j.c); j.dead = true; ev.push(['snap', j.x, j.y, j.mat]); }
    for (const sd of TR) for (const [fx, open, dir] of [[sd.x0, sd.openL, -1], [sd.x1, sd.openR, 1]]){ if (!open || Math.abs(fx - x) > 2.6 || y > sd.top) continue;
      for (let i = 0; i < 9; i++) spawnDebris(1, fx + dir * .2, Math.min(sd.top - .1, y - .5 + rnd() * 2.5), (rnd() - .5) * 2, .08 + rnd() * .1, 6); ev.push(['crumble', fx, y + .6, 1]); }
    if (FLOOR != null && y - FLOOR < 1.5){ for (let i = 0; i < 7; i++) spawnDebris(1, x + (rnd() - .5) * 1.4, FLOOR + .2, (rnd() - .5) * 1.5, .08 + rnd() * .1, 7); ev.push(['crumble', x, FLOOR + .2, .8]); } }
  const ang = b => { const q = b.GetRotation(); return 2 * Math.atan2(q.GetZ(), q.GetW()); };
  const P = b => { const p = b.GetPosition(); return [p.GetX(), p.GetY(), ang(b)]; };
  // position of a point fixed to the body, e.g. the car's own origin rather than the box centre
  const PO = (b, ox, oy) => { const [x, y, a] = P(b), c = Math.cos(a), s = Math.sin(a); return [x + c * ox - s * oy, y + s * ox + c * oy, a]; };
  const P3 = b => { const p = b.GetPosition(), q = b.GetRotation(); return [p.GetX(), p.GetY(), p.GetZ(), q.GetX(), q.GetY(), q.GetZ(), q.GetW()]; };

  function step(){
    ev = [];
    const go = t >= .4; wheels.forEach(o => o.on && o.c.SetTargetAngularVelocity(go && !won ? -level.speed : 0));
    for (const o of hz2){ const h = o.h;
      if (h.type === 'spinner'){ o.ang -= h.spin * DT; const q = new J.Quat(0, 0, Math.sin(o.ang / 2), Math.cos(o.ang / 2)), p = new J.RVec3(h.x, h.y, 0); bi.MoveKinematic(o.info.id, p, q, DT); J.destroy(q); J.destroy(p);
        if (h.shots && t >= o.next){ const k = o.bullets.length, a = h.shots.angles[k % h.shots.angles.length], info = { kind: 'bullet' };
          mk(bulletShape, h.x + Math.sin(a) * .7, h.y + Math.cos(a) * .7, 0, Qz(-a), J.EMotionType_Dynamic, info, { plane: true, bullet: true, mass: 30, restitution: .3 });
          bi.SetLinearVelocity(info.id, V(Math.sin(a) * h.shots.speed, Math.cos(a) * h.shots.speed, 0)); o.bullets.push({ info, t0: t }); o.next += h.shots.every; ev.push(['shot', h.x, h.y]); } }
      if (h.type === 'saw'){ const w = 2 * Math.PI / h.period, u = .5 - .5 * Math.cos(w * (t + DT)), [p0, p1] = h.path; o.ang -= h.spin * DT;
        const q = new J.Quat(0, 0, Math.sin(o.ang / 2), Math.cos(o.ang / 2)), p = new J.RVec3(p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, 0); bi.MoveKinematic(o.info.id, p, q, DT); J.destroy(q); J.destroy(p); }
      if (h.type === 'fan'){ const [dx, dy] = h.dir; for (const o2 of infos){ if (!o2.b || o2.gone || !(o2.kind === 'car' || o2.kind === 'wheel' || o2.kind === 'ink' || o2.kind === 'rock' || o2.kind === 'panel' || o2.kind === 'shard') || (o2.kind === 'ink' && !o2.alive)) continue;
          const b = o2.b, [px, py] = pos(b), rx = px - h.x, ry = py - h.y, along = rx * dx + ry * dy, side = Math.abs(rx * -dy + ry * dx);
          if (along > 0 && along < h.length && side < h.width / 2){ const m = 1 / Math.max(1e-6, b.GetMotionProperties().GetInverseMass()), f = h.power * m * (1 - along / h.length * .6), fv = new J.Vec3(dx * f, dy * f, 0); bi.AddForce(o2.id, fv, J.EActivation_Activate); J.destroy(fv); } } } }
    jolt.Step(DT, 1); t += DT;

    // impacts -> sounds, hazard damage, shattering drawings, chipped cliffs
    let sounds = 0; const carHits = [];
    for (const h of hits){ const { ua, ub } = h, ca = isCar(ua), cb = isCar(ub);
      const hzk = ca ? (ub.hz || (ub.kind === 'bullet' && 'bullet')) : cb ? (ua.hz || (ua.kind === 'bullet' && 'bullet')) : null;
      if (hzk){ ev.push(['spark', h.x, h.y]); if (t - (hzCool[hzk] ?? -1) > .3){ hzCool[hzk] = t; damage(HAZ_DMG[hzk], h.x, h.y); } }
      for (const [u, o] of [[ua, ub], [ub, ua]]){
        if (u.kind === 'ink' && u.alive && MATERIALS[u.mat].shatter && h.v > MATERIALS[u.mat].shatter && o.kind !== 'ink') killInk(u, 'shatter');
        if (u.kind === 'block' && !u.broken && ((o.kind === 'bullet' && h.v > 8) || (o.kind !== 'ink' && h.J > BLOCK_J))) breakBlock(u, h.x, h.y + 1, o.kind === 'bullet' ? 3 : Math.min(6, h.J / 300)); }
      if ((ca || cb) && !hzk && h.J > 700) damage((h.J - 700) / 45, h.x, h.y);
      if (h.v > 1.2 && sounds < 6){ const last = Math.max(ua.lastHit ?? -1, ub.lastHit ?? -1); if (t - last > .09){ ua.lastHit = ub.lastHit = t; sounds++; ev.push(['hit', sound(ua), sound(ub), h.v, h.x, h.y]); } } }
    hits.length = 0;
    // sudden stops hurt (landing from a height, slamming into a wall)
    let dvMax = 0; for (const b of [car, cabin, ...wheels.filter(o => o.on).map(o => o.w)]){ const v = b.GetLinearVelocity(), vx = v.GetX(), vy = v.GetY(), pv = prevVs.get(b); if (pv) dvMax = Math.max(dvMax, Math.hypot(vx - pv[0], vy - pv[1])); prevVs.set(b, [vx, vy]); }
    if (dvMax > 5){ const [px, py] = pos(car); damage((dvMax - 5) * 9, px, py); }
    // the car falls apart as it gets hurt
    if (!exploded){
      if (hp < 50 && cabinJ){ sys.RemoveConstraint(cabinJ); cabinJ = null; bi.AddImpulse(cabInfo.id, V(-10, 40, 0)); ev.push(['partoff', ...P(cabin)]); }
      if (hp < 35 && wheels[1].on){ sys.RemoveConstraint(wheels[1].c); wheels[1].on = false; ev.push(['partoff', ...P(wheels[1].w)]); }
      if (hp < 25 && !fire){ fire = true; fireAt = t; ev.push(['fire']); }
      if (hp <= -20 || (fire && t - fireAt > 2.2)){ const [px, py] = pos(car); explode(px, py); } }
    // drawings bend, snap or rip off when loaded too hard
    for (const j of joints) if (!j.dead){ const lp = j.c.GetTotalLambdaPosition(), F = Math.hypot(lp.GetX(), lp.GetY()) / DT, Tq = j.T ? Math.abs(j.c.GetTotalLambdaRotationLimits()) / DT : 0;
      if (F > j.F || (j.T && Tq > j.T)){ sys.RemoveConstraint(j.c); j.dead = true; ev.push(['snap', j.x, j.y, j.mat]); } }
    // brittle pieces shatter when jolted
    for (const o of ink) if (o.alive && MATERIALS[o.mat].shatter){ const v = o.b.GetLinearVelocity(), pv = o.pv; o.pv = [v.GetX(), v.GetY()]; if (pv && Math.hypot(v.GetX() - pv[0], v.GetY() - pv[1]) > MATERIALS[o.mat].shatter * .9) killInk(o, 'shatter'); }
    // tidy up things that fell out of the world
    for (const d of debris) if (!d.gone && d.info.b.GetPosition().GetY() < low - 45){ bi.RemoveBody(d.info.id); d.gone = true; d.info.gone = true; }

    const [px, py] = pos(car), v = car.GetLinearVelocity(), vx = v.GetX(), vy = v.GetY(), a = ang(car);
    if (prevV){ const dv = Math.hypot(vx - prevV[0], vy - prevV[1]); if (dv > 4.5) ev.push(['crash', Math.min(1, dv / 14), px, py]); } prevV = [vx, vy];
    if (!won && !exploded && Math.abs(px - level.flag[0]) < .9 && py > level.flag[1] && py < level.flag[1] + 2 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 1){ won = true; wonAt = t; ev.push(['win']); }
    if (fellAt < 0 && py < low - 2.5){ fellAt = t; ev.push(['fall']); }
    if (px > prog.x + .35 || py < prog.y - .6) prog = { x: Math.max(px, prog.x), y: Math.min(py, prog.y), t };
    if (!ended){
      if (won && t - wonAt > 2.2) ended = 'win';
      else if (exploded && t - boomAt > 3.2) ended = 'boom';
      else if (!exploded && !fire && fellAt > 0 && t - fellAt > 4) ended = 'fell';
      else if (!fire && t > 2 && t - prog.t > 2.5) ended = fellAt > 0 ? 'fell' : 'stuck';
      else if (t > 16) ended = 'timeout';
      if (ended) ev.push(['end', ended]); }
    return ev;
  }
  function state(){
    let roll = 0; for (const o of wheels){ const [wx, wy] = pos(o.w); if (o.on && surfNear(wx, wy)) roll += Math.abs(o.w.GetAngularVelocity().GetZ()) / 2; }
    return { t, car: PO(car, 0, .05), cabin: PO(cabin, .1, -.34), wheels: wheels.map(o => P(o.w)), hp, fire, exploded, won, ended, roll, rpm: wheels.reduce((s, o) => s + (o.on ? Math.abs(o.w.GetAngularVelocity().GetZ()) : 0), 0) / 2,
      ink: ink.map(o => o.alive ? P(o.b) : null), blocks: blocks.map(o => o.broken ? P3(o.b) : null), debris: debris.filter(d => !d.gone).map(d => [...P3(d.info.b), d.k, d.s, d.mat || '']),
      hazards: hz2.map(o => o.h.type === 'spinner' ? { spin: o.ang, bullets: o.bullets.map(q => [...P(q.info.b), t - q.t0]) } : o.h.type === 'saw' ? { pos: P(o.info.b) } : { t }) };
  }
  // is a wheel touching something? (cheap check: anything solid just below it)
  function surfNear(x, y){ if (surfDist(x, y - .3) < .12) return true; for (const o of ink) if (o.alive){ const [ix, iy] = pos(o.b); if (Math.abs(ix - x) < .4 && Math.abs(iy - (y - .37)) < .15) return true; } return false; }
  function dispose(){ if (!trash) return; J.destroy(jolt); J.destroy(cl); for (const o of trash) J.destroy(o); trash.length = 0; }
  return { step, state, strokes, mats, ink: ink.map(o => ({ stroke: o.stroke, seg: o.seg, mat: o.mat, ends: o.ends })), dispose, get t(){ return t; } };
}
export function inkLength(strokes){ let L = 0; for (const s of strokes) for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; }
