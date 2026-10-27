// Deterministic physics for one run (planck.js / Box2D). Same level + same button presses => same run,
// which is what lets a liked run be replayed exactly when the video is made.
const pl = window.planck;
export const DT = 1 / 60;
export const KEY = { left: 1, right: 2, jump: 4 };
export const PIT_Y = -3.2;
export const pitAt = (L, x) => L.pits.find(p => x > p.x0 && x < p.x1);

// ---- tuning
const DRIVE = 17, REVERSE = 9, TORQUE = 55, HOP = 5.2, AIR_TQ = 34;   // wheel speed (rad/s), motor torque, hop speed, mid-air tilt
const HURT_J = 4;                                                     // impulse above this damages a car piece
const MIN_SPLIT = .3;                                                 // pieces narrower than this shred to scrap instead of splitting
const MAX_DEBRIS = 220;

// ---- the car, piece by piece (car-local metres: x forward, y up, ground at 0). Every piece is its own rigid body,
// welded to its neighbours; welds snap, pieces split, glass shatters. w/h = full size, a = tilt (radians).
// type: frame | engine | panel (two side skins) | top (full-width sheet) | bumper | pillar | glass | side (side windows) | tank | light
export const TYPES = ['frame', 'engine', 'panel', 'top', 'bumper', 'pillar', 'glass', 'side', 'tank', 'light'];
const slant = (n, t, x0, y0, x1, y1, h, to) => ({ n, t, c: [(x0 + x1) / 2, (y0 + y1) / 2], w: Math.hypot(x1 - x0, y1 - y0), h, a: Math.atan2(y1 - y0, x1 - x0), to });
export const CAR = [
  { n: 'fr0', t: 'frame', c: [-1.35, .6], w: .9, h: .26, to: ['fr1'] },
  { n: 'fr1', t: 'frame', c: [-.45, .6], w: .9, h: .26, to: ['fr2'] },
  { n: 'fr2', t: 'frame', c: [.45, .6], w: .9, h: .26, to: ['fr3'] },
  { n: 'fr3', t: 'frame', c: [1.35, .6], w: .9, h: .26 },
  { n: 'engine', t: 'engine', c: [1.22, .9], w: .62, h: .34, to: ['fr3'] },
  { n: 'bumpF', t: 'bumper', c: [1.88, .6], w: .16, h: .3, to: ['fr3'] },
  { n: 'bumpR', t: 'bumper', c: [-1.88, .6], w: .16, h: .3, to: ['fr0'] },
  { n: 'fenderF', t: 'panel', c: [1.35, .89], w: .9, h: .32, to: ['fr3', 'bumpF'] },
  { n: 'doorF', t: 'panel', c: [.45, .93], w: .88, h: .4, to: ['fr2', 'fenderF'] },
  { n: 'doorR', t: 'panel', c: [-.45, .93], w: .88, h: .4, to: ['fr1', 'doorF'] },
  { n: 'quarter', t: 'panel', c: [-1.35, .89], w: .9, h: .32, to: ['fr0', 'doorR', 'bumpR'] },
  { n: 'hood', t: 'top', c: [1.34, 1.08], w: .96, h: .07, to: ['fenderF', 'engine'] },
  { n: 'trunk', t: 'top', c: [-1.36, 1.08], w: .9, h: .07, to: ['quarter'] },
  slant('pillarA', 'pillar', .9, 1.1, .55, 1.5, .07, ['doorF', 'hood', 'roof']),
  slant('wind', 'glass', .86, 1.1, .5, 1.47, .04, ['pillarA', 'hood']),
  { n: 'roof', t: 'top', c: [-.15, 1.5], w: 1.42, h: .07, to: ['pillarB'] },
  { n: 'pillarB', t: 'pillar', c: [0, 1.31], w: .07, h: .38, to: ['doorR', 'doorF'] },
  slant('pillarC', 'pillar', -.86, 1.5, -1.28, 1.12, .07, ['roof', 'quarter', 'trunk']),
  slant('rearWin', 'glass', -.82, 1.47, -1.22, 1.12, .04, ['pillarC', 'trunk']),
  { n: 'winF', t: 'side', c: [.3, 1.31], w: .5, h: .34, to: ['doorF', 'pillarB', 'roof'] },
  { n: 'winR', t: 'side', c: [-.42, 1.31], w: .72, h: .34, to: ['doorR', 'pillarB', 'roof'] },
  { n: 'tank', t: 'tank', c: [-1.25, .4], w: .5, h: .14, to: ['fr0'] },
  { n: 'lightF', t: 'light', c: [1.87, .84], w: .06, h: .11, to: ['fenderF'] },
  { n: 'lightR', t: 'light', c: [-1.87, .84], w: .06, h: .11, to: ['quarter'] },
];
const DENS = { frame: 5, engine: 9, panel: 1.6, top: 1.6, bumper: 3, pillar: 3, glass: 1.2, side: 1.2, tank: 2, light: 1 };
const WELD = { frame: 4000, engine: 2600, panel: 1300, top: 1100, bumper: 1600, pillar: 1400, glass: 520, side: 520, tank: 1200, light: 300 };  // newtons to snap
const TOUGH = { frame: 3, engine: 2, panel: 7, top: 8, bumper: 4, pillar: 5, glass: 30, side: 30, tank: 5, light: 40 };                     // damage per unit impulse
const WHEELS = [{ x: -1.15, on: 'fr0' }, { x: 1.15, on: 'fr3' }], WHEEL_R = .36;

export function createSim(L){
  const { World, Vec2, Box, Circle, Polygon, WeldJoint, WheelJoint } = pl;
  const world = new World({ gravity: Vec2(0, -10) });
  let seed = 20240917; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let ev = [], t = 0;

  // ---- the building: floor with trenches cut into it, end walls, ceiling
  const [X0, X1] = L.length, building = world.createBody(); building.setUserData({ kind: 'floor' });
  let x = X0; for (const p of [...L.pits].sort((a, b) => a.x0 - b.x0).concat([{ x0: X1, x1: X1 }])){ if (p.x0 > x) building.createFixture(Box((p.x0 - x) / 2, 2, Vec2((x + p.x0) / 2, -2)), { friction: 1 }); x = p.x1; }
  for (const p of L.pits) building.createFixture(Box((p.x1 - p.x0) / 2, .4, Vec2((p.x0 + p.x1) / 2, PIT_Y - .4)), { friction: 1 });
  building.createFixture(Box(.5, 6, Vec2(X0 - .5, 2)), {}); building.createFixture(Box(.5, 6, Vec2(X1 + .5, 2)), {});
  building.createFixture(Box((X1 - X0) / 2 + 1, .3, Vec2((X0 + X1) / 2, L.ceil + .3)), { friction: .6 });
  const spikes = world.createBody(); spikes.setUserData({ kind: 'metal', hz: 'spike' });
  for (const p of L.pits) for (let sx = p.x0 + .25; sx < p.x1 - .1; sx += .45) spikes.createFixture(Polygon([Vec2(sx - .15, PIT_Y), Vec2(sx + .15, PIT_Y), Vec2(sx, PIT_Y + .55)]), { friction: .2 });
  const tiles = [];
  for (const p of L.pits.filter(p => p.cover)){ const n = Math.round((p.x1 - p.x0) / .5), w = (p.x1 - p.x0) / n;
    for (let i = 0; i < n; i++){ const b = world.createBody({ position: Vec2(p.x0 + (i + .5) * w, -.125) }); b.createFixture(Box(w / 2 - .005, .125), { density: 2, friction: 1 }); const o = { b, w, dropAt: -1, dropped: false }; b.setUserData({ kind: 'tile', tile: o }); tiles.push(o); } }
  function dropTile(o, kick = 0){ if (o.dropped) return; o.dropped = true; o.b.setType('dynamic'); o.b.resetMassData(); o.b.setAwake(true); if (kick) o.b.setLinearVelocity(Vec2((rnd() - .5) * kick, kick * (.5 + rnd()))); o.b.setAngularVelocity((rnd() - .5) * (2 + kick)); ev.push(['creak', o.b.getPosition().x]); }

  // ---- the car
  const CX = L.start, pieces = [], welds = []; let nextId = 0;
  function makePiece(n, type, cx, cy, w, h, a, hp = 100, v = null, av = 0){ const b = world.createBody({ type: 'dynamic', position: Vec2(cx, cy), angle: a, angularDamping: .05 });
    b.createFixture(Box(w / 2, h / 2), { density: DENS[type], friction: .7, restitution: .05, filterGroupIndex: -2 }); if (v) b.setLinearVelocity(v); b.setAngularVelocity(av);
    const o = { id: nextId++, n, type, w, h, b, hp, flat: false, gone: false, stuck: false, cool: -1 }; b.setUserData({ kind: 'car', piece: o }); pieces.push(o); return o; }
  const byName = {}; for (const P of CAR) byName[P.n] = makePiece(P.n, P.t, CX + P.c[0], P.c[1], P.w, P.h, P.a || 0);
  function weld(a, b, x, y, limit){ const j = world.createJoint(WeldJoint({}, a.b, b.b, Vec2(x, y))); const o = { a, b, j, limit, x: x - 0, y }; welds.push(o); return o; }
  for (const P of CAR) for (const m of P.to || []){ const a = byName[P.n], b = byName[m], pa = a.b.getPosition(), pb = b.b.getPosition(); weld(a, b, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, Math.min(WELD[a.type], WELD[b.type])); }
  // wheels on sprung axles
  const wheels = WHEELS.map(W => { const b = world.createBody({ type: 'dynamic', position: Vec2(CX + W.x, WHEEL_R) }); const o = { b, r: WHEEL_R, on: null, j: null, popped: false, gone: false, cool: -1 };
    b.createFixture(Circle(WHEEL_R), { density: 2, friction: 1.6, restitution: .1, filterGroupIndex: -2 }); b.setUserData({ kind: 'tire', wheel: o }); attachWheel(o, byName[W.on]); return o; });
  function attachWheel(o, piece){ const p = o.b.getPosition(); o.on = piece; o.j = world.createJoint(WheelJoint({ motorSpeed: 0, maxMotorTorque: 2, enableMotor: true, frequencyHz: 4.2, dampingRatio: .55 }, piece.b, o.b, p, piece.b.getWorldVector(Vec2(0, 1)))); }
  function dropWheel(o, why){ if (!o.j) return; world.destroyJoint(o.j); o.j = null; o.on = null; ev.push(['partoff', o.b.getPosition().x, why]); }
  function popTire(o){ if (o.popped) return; o.popped = true; o.r = WHEEL_R * .72; const f = o.b.getFixtureList(); o.b.destroyFixture(f); o.b.createFixture(Circle(o.r), { density: 2, friction: 2.2, restitution: 0, filterGroupIndex: -2 }); ev.push(['pop', o.b.getPosition().x]); }

  // ---- breaking things
  function unweld(o, quiet){ for (const w of welds) if (!w.dead && (w.a === o || w.b === o)){ world.destroyJoint(w.j); w.dead = true; } if (!quiet) ev.push(['snap', o.b.getPosition().x, o.b.getPosition().y]); }
  function removePiece(o){ unweld(o, true); for (const wh of wheels) if (wh.on === o) dropWheel(wh, 'axle'); world.destroyBody(o.b); o.gone = true; }
  // cut a piece in two at a world point: two new bodies inherit its welds (whichever half is nearer) and any axle
  function split(o, px, py, why){ if (o.gone) return null; if (o.w < MIN_SPLIT){ shred(o, why); return null; }
    const lp = o.b.getLocalPoint(Vec2(px, py)), s = Math.max(-o.w / 2 + .12, Math.min(o.w / 2 - .12, lp.x)), w1 = s + o.w / 2, w2 = o.w / 2 - s;
    const a = o.b.getAngle(), c = o.b.getPosition(), ux = Math.cos(a), uy = Math.sin(a), av = o.b.getAngularVelocity();
    const mk = (lx, w) => { const wx = c.x + ux * lx, wy = c.y + uy * lx; return makePiece(o.n, o.type, wx, wy, w, o.h, a, o.hp, o.b.getLinearVelocityFromWorldPoint(Vec2(wx, wy)), av); };
    const A = mk(-o.w / 2 + w1 / 2, w1), B = mk(o.w / 2 - w2 / 2, w2); A.flat = B.flat = o.flat;
    for (const w of welds) if (!w.dead && (w.a === o || w.b === o)){ const other = w.a === o ? w.b : w.a, an = w.j.getAnchorA(), side = o.b.getLocalPoint(an).x < s ? A : B; world.destroyJoint(w.j); w.dead = true; if (!other.gone) weld(side, other, an.x, an.y, w.limit); }
    for (const wh of wheels) if (wh.on === o){ const lx = o.b.getLocalPoint(wh.b.getPosition()).x; world.destroyJoint(wh.j); wh.j = null; attachWheel(wh, lx < s ? A : B); }
    world.destroyBody(o.b); o.gone = true; ev.push(['split', px, py, TYPES.indexOf(o.type), why]); for (let i = 0; i < 2; i++) spawn(o.type === 'glass' || o.type === 'side' ? 3 : 2, px, py, (rnd() - .5) * 4, rnd() * 3); return [A, B]; }
  // too small to split: tear it loose and break it into scrap
  function shred(o, why){ if (o.gone) return; const p = o.b.getPosition(), v = o.b.getLinearVelocity(), glass = o.type === 'glass' || o.type === 'side' || o.type === 'light';
    removePiece(o); const n = glass ? 6 + Math.round(o.w * 10) : 2 + Math.round(o.w * 6); for (let i = 0; i < n; i++) spawn(glass ? 3 : o.type === 'panel' || o.type === 'top' || o.type === 'pillar' ? 4 : 2, p.x + (rnd() - .5) * o.w, p.y + (rnd() - .5) * o.h, v.x + (rnd() - .5) * 4, v.y + rnd() * 3);
    if (rnd() < .5) spawn(5, p.x, p.y, v.x + (rnd() - .5) * 5, v.y + 2 + rnd() * 3); ev.push([glass ? 'glass' : 'shred', p.x, p.y, why]); }
  function breakPiece(o, px, py, J){ if (o.gone) return;
    if (o.type === 'glass' || o.type === 'side' || o.type === 'light') return shred(o, 'smash');
    if (o.type === 'tank'){ if (fuse < 0){ fuse = t + .5; ev.push(['leak', px, py]); } return; }
    if (o.type === 'engine'){ if (!engineDead){ engineDead = true; ev.push(['engine', px, py]); } return; }
    o.hp = 60; unweld(o); if (J > 30 && o.w > MIN_SPLIT) split(o, px, py, 'crash'); }

  // ---- traps
  const hz = L.hazards.map(h => {
    if (h.type === 'crusher'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.x, crY(h, 0)) }); b.setUserData({ kind: 'metal', hz: 'crusher' }); b.createFixture(Box(h.w / 2, .6), { friction: .6 }); return { h, b }; }
    if (h.type === 'saw'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.path[0][0], h.path[0][1]) }); b.setUserData({ kind: 'metal', hz: 'saw' }); b.setAngularVelocity(-h.spin);
      b.createFixture(Circle(h.r * .82), { friction: .2, restitution: .4 }); for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, a2 = a + .3; b.createFixture(Polygon([Vec2(Math.cos(a) * h.r * .8, Math.sin(a) * h.r * .8), Vec2(Math.cos(a + .18) * h.r * 1.12, Math.sin(a + .18) * h.r * 1.12), Vec2(Math.cos(a2) * h.r * .8, Math.sin(a2) * h.r * .8)]), { restitution: .4 }); }
      return { h, b }; }
    if (h.type === 'mine'){ const b = world.createBody({ position: Vec2(h.x, .04) }); b.setUserData({ kind: 'mine', mine: null }); b.createFixture(Circle(.55), { isSensor: true }); const o = { h, b, armAt: -1, gone: false }; b.getUserData().mine = o; return o; }
    return { h }; });
  function crY(h, tt){ const u = (((tt + h.phase) / h.period) % 1 + 1) % 1, top = L.ceil - .6, bot = .6, ease = k => k * k * (3 - 2 * k);
    if (u < .5) return top; if (u < .58){ const k = (u - .5) / .08; return top - (top - bot) * k * k; } if (u < .72) return bot; return bot + (top - bot) * ease((u - .72) / .28); }

  // ---- debris: ceiling tiles (0), concrete (1), scrap metal (2), glass (3), painted body scraps (4), springs and bolts (5)
  const debris = [];
  function spawn(kind, x, y, vx, vy){ if (debris.filter(d => !d.gone).length >= MAX_DEBRIS) return; const b = world.createBody({ type: 'dynamic', position: Vec2(x, y), angle: rnd() * 6 });
    let s, h = 0; if (kind === 0 || kind === 4){ s = kind ? .06 + rnd() * .12 : .18 + rnd() * .14; h = kind ? .015 : .025; b.createFixture(Box(s, h), { density: 1.5, friction: .6, restitution: .25 }); }
    else if (kind === 3){ s = .04 + rnd() * .07; b.createFixture(Polygon([Vec2(-s, -s * .4), Vec2(s, -s * .2), Vec2(rnd() * s * .5, s * .6)]), { density: 1.2, friction: .3, restitution: .3 }); }
    else if (kind === 5){ s = .05 + rnd() * .05; b.createFixture(Circle(s), { density: 3, friction: .5, restitution: .5 }); }
    else { s = (kind === 2 ? .04 : .07) + rnd() * .08; const pts = []; for (let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2 + rnd() * .4; pts.push(Vec2(Math.cos(a) * s * (.7 + rnd() * .5), Math.sin(a) * s * (.7 + rnd() * .5))); } b.createFixture(Polygon(pts), { density: 2.5, friction: .8, restitution: .15 }); }
    b.setUserData({ kind: kind === 3 ? 'glass' : kind >= 2 ? 'scrap' : kind === 1 ? 'rock' : 'panel' }); b.setLinearVelocity(Vec2(vx, vy)); b.setAngularVelocity((rnd() - .5) * 24); debris.push({ b, k: kind, s, h }); }

  let fuse = -1, boomed = false, engineDead = false;
  function explode(x, y, big){ const R = big ? 4.5 : 3.6; ev.push(['boom', x, y, big ? 1 : .7]);
    for (const o of pieces.filter(o => !o.gone)){ const p = o.b.getPosition(), d = Math.hypot(p.x - x, p.y - y); if (d > R * .7) continue; o.hp -= 140 * (1 - d / (R * .7));
      if (o.type === 'glass' || o.type === 'side' || o.type === 'light') shred(o, 'boom'); else if (o.type === 'tank'){ if (fuse < 0) fuse = t + .15; } else if (o.type === 'engine'){ if (d < 1.6) engineDead = true; } else if (d < R * .45 && rnd() < .8){ unweld(o, true); if (o.w > MIN_SPLIT && rnd() < .6) split(o, p.x + (rnd() - .5) * o.w * .6, p.y, 'boom'); } }
    for (const wh of wheels) if (wh.j && Math.hypot(wh.b.getPosition().x - x, wh.b.getPosition().y - y) < R * .45) dropWheel(wh, 'boom');
    for (const o of tiles) if (Math.abs(o.b.getPosition().x - x) < 2.2) dropTile(o, 6);
    for (let b = world.getBodyList(); b; b = b.getNext()){ if (!b.isDynamic()) continue; const p = b.getPosition(), dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy); if (d > R || d < 1e-3) continue;
      const k = (1 - d / R) * (big ? 13 : 9) * b.getMass(); b.applyLinearImpulse(Vec2(dx / d * k, (Math.max(0, dy / d) + .9) * k), p, true); b.applyAngularImpulse((rnd() - .5) * k * .3, true); }
    for (let i = 0; i < 8; i++) spawn(1, x + (rnd() - .5) * 1.2, .1, (rnd() - .5) * 9, 3 + rnd() * 7);
    for (let i = 0; i < (big ? 8 : 5); i++) spawn(0, x + (rnd() - .5) * 3, L.ceil - .1, (rnd() - .5) * 2, -rnd() * 2);
    ev.push(['crumble', x, L.ceil, .8]); }

  // ---- contacts: collect during the step, act after it (Box2D forbids changes mid-step)
  const touches = [], pushes = [];
  world.on('begin-contact', c => { const fa = c.getFixtureA(), fb = c.getFixtureB(), A = fa.getBody(), B = fb.getBody(), ua = A.getUserData() || {}, ub = B.getUserData() || {};
    if (fa.isSensor() || fb.isSensor()){ const m = ua.kind === 'mine' ? ua.mine : ub.kind === 'mine' ? ub.mine : null, other = ua.kind === 'mine' ? B : A; if (m && other.isDynamic() && m.armAt < 0 && !m.gone){ m.armAt = t; ev.push(['click', m.h.x]); } return; }
    if (!c.getManifold().pointCount) return; const wm = c.getWorldManifold(null), p = wm.points[0], n = wm.normal, va = A.getLinearVelocityFromWorldPoint(p), vb = B.getLinearVelocityFromWorldPoint(p);
    touches.push({ A, B, ua, ub, x: p.x, y: p.y, v: Math.abs((vb.x - va.x) * n.x + (vb.y - va.y) * n.y) }); });
  world.on('post-solve', (c, imp) => { const J = (imp.normalImpulses[0] || 0) + (imp.normalImpulses[1] || 0); if (J < HURT_J) return;
    const A = c.getFixtureA().getBody(), B = c.getFixtureB().getBody(), wm = c.getWorldManifold(null), p = wm.points[0]; pushes.push({ ua: A.getUserData() || {}, ub: B.getUserData() || {}, J, x: p.x, y: p.y }); });
  const MAT = { car: 'metal', tire: 'tire', metal: 'metal', floor: 'stone', rock: 'rock', tile: 'stone', panel: 'plate', glass: 'glass', scrap: 'metal' };

  // ---- which pieces are still one car: everything welded to the engine
  let stuckX = 0, stuckT = 0, main = new Set(), power = false, grounded = false, hopT = -1, wreckAt = -1, won = false, wonAt = -1, ended = null, carX = CX, carY = .9, startArea = 0, rpm = 0;
  function connect(){ const live = pieces.filter(o => !o.gone), adj = new Map(live.map(o => [o, []])); for (const w of welds) if (!w.dead && !w.a.gone && !w.b.gone){ adj.get(w.a).push(w.b); adj.get(w.b).push(w.a); }
    const eng = live.find(o => o.type === 'engine'); main = new Set(); if (eng){ const q = [eng]; main.add(eng); while (q.length){ const o = q.pop(); for (const n of adj.get(o)) if (!main.has(n)){ main.add(n); q.push(n); } } }
    const driven = wheels.filter(w => w.j && main.has(w.on)); power = !engineDead && !boomed && driven.length > 0;
    let mx = 0, my = 0, m = 0; for (const o of main){ const p = o.b.getPosition(), k = o.b.getMass(); mx += p.x * k; my += p.y * k; m += k; } if (m){ carX = mx / m; carY = my / m; } return driven; }
  const area = () => [...main].reduce((a, o) => a + o.w * o.h * Math.max(0, Math.min(1, o.hp / 100)) * (o.flat ? .4 : 1), 0);
  connect(); startArea = area();

  function control(inp, driven){ const dir = (inp & KEY.right ? 1 : 0) - (inp & KEY.left ? 1 : 0), able = power && !won;
    grounded = false; for (const w of wheels) if (w.j && main.has(w.on)) for (let ce = w.b.getContactList(); ce; ce = ce.next) if (ce.contact.isTouching() && !ce.contact.getFixtureA().isSensor() && !ce.contact.getFixtureB().isSensor()) grounded = true;
    for (const w of wheels){ if (!w.j) continue; const go = able && driven.includes(w) && dir; w.j.setMaxMotorTorque(go ? TORQUE : won ? 30 : 1.5); w.j.setMotorSpeed(go ? (dir > 0 ? -DRIVE : REVERSE) : 0); }
    rpm = driven.length ? Math.abs(driven.reduce((a, w) => a + w.b.getAngularVelocity(), 0) / driven.length) : 0;
    const core = [...main].find(o => o.type === 'frame') || [...main][0]; if (!core || !able) return;
    if (!grounded && dir) core.b.applyTorque(-dir * AIR_TQ, true);
    if (inp & KEY.jump && grounded && t - hopT > .7){ hopT = t; for (const o of main){ const v = o.b.getLinearVelocity(); o.b.setLinearVelocity(Vec2(v.x, Math.max(v.y, 0) + HOP)); } for (const w of driven){ const v = w.b.getLinearVelocity(); w.b.setLinearVelocity(Vec2(v.x, Math.max(v.y, 0) + HOP)); } ev.push(['hop', carX]); }
  }

  function step(inp = 0){
    ev = []; const driven = connect(); control(inp, driven);
    for (const o of hz){ const h = o.h;
      if (h.type === 'crusher'){ const y0 = o.b.getPosition().y, y1 = crY(h, t + DT); o.b.setLinearVelocity(Vec2(0, (y1 - y0) / DT)); const bottom = y1 - .6;
        if (y1 < y0 - .01){ for (const q of pieces) if (!q.gone && !q.flat){ const p = q.b.getPosition(), top = p.y + q.h / 2; if (Math.abs(p.x - h.x) < h.w / 2 + q.w * .3 && p.y < y0 && p.y > -.2 && bottom < top - .05) crush(q, h); }
          for (const w of wheels) if (!w.gone){ const p = w.b.getPosition(); if (Math.abs(p.x - h.x) < h.w / 2 && bottom < p.y + w.r * .5 && p.y < y0){ popTire(w); dropWheel(w, 'crush'); } } }
        if (y1 <= .6 + 1e-4 && y0 > .6 + 1e-4){ ev.push(['slam', h.x, 0, 1]); for (let i = 0; i < 3; i++) spawn(1, h.x + (rnd() < .5 ? -1 : 1) * (h.w / 2 + .1), .15, (rnd() - .5) * 5, 2 + rnd() * 3); } }
      if (h.type === 'saw'){ const w = 2 * Math.PI / h.period, du = .5 * w * Math.sin(w * t), [p0, p1] = h.path; o.b.setLinearVelocity(Vec2((p1[0] - p0[0]) * du, (p1[1] - p0[1]) * du)); }
      if (h.type === 'mine' && o.armAt >= 0 && !o.gone && t - o.armAt > .22){ o.gone = true; world.destroyBody(o.b); explode(h.x, .1, false); } }
    for (const o of tiles) if (!o.dropped && o.dropAt >= 0 && t >= o.dropAt) dropTile(o);
    if (fuse >= 0 && !boomed && t >= fuse){ boomed = true; const k = pieces.find(o => o.type === 'tank' && !o.gone) || pieces.find(o => o.type === 'tank'); const p = k.b.getPosition(); if (!k.gone) removePiece(k); explode(p.x, p.y, true); }
    world.step(DT, 8, 3); t += DT;

    // saws slice whatever they touch, spikes pop tyres and skewer panels
    let sounds = 0;
    for (const c of touches){ for (const [u, w, B] of [[c.ua, c.ub, c.B], [c.ub, c.ua, c.A]]){
        if (u.kind === 'car'){ const o = u.piece; if (o.gone) continue;
          if (w.hz === 'saw' && t - o.cool > .1){ o.cool = t; ev.push(['cut', c.x, c.y]); const r = split(o, c.x, c.y, 'saw'); if (r) for (const q of r){ q.cool = t; q.hp -= 25; } }
          else if (w.hz === 'spike' && !o.stuck){ o.stuck = true; o.hp -= 40; world.createJoint(WeldJoint({}, B, o.b, Vec2(c.x, c.y))); ev.push(['impale', c.x, c.y]); if (o.type === 'tank' && fuse < 0) fuse = t + .6; } }
        if (u.kind === 'tire'){ const o = u.wheel; if (w.hz === 'spike') popTire(o); if (w.hz === 'saw' && t - o.cool > .3){ o.cool = t; popTire(o); ev.push(['cut', c.x, c.y]); if (rnd() < .5) dropWheel(o, 'saw'); } }
        if (u.kind === 'car' || u.kind === 'tire'){ if (w.kind === 'tile' && w.tile.dropAt < 0) w.tile.dropAt = t + .18; } }
      if (c.v > 1.2 && sounds < 6){ const last = Math.max(c.ua.lastHit ?? -1, c.ub.lastHit ?? -1); if (t - last > .09){ c.ua.lastHit = c.ub.lastHit = t; sounds++; ev.push(['hit', MAT[c.ua.kind] || 'stone', MAT[c.ub.kind] || 'stone', c.v, c.x, c.y]); } } }
    touches.length = 0;
    // hard knocks dent, crack and tear pieces off
    for (const q of pushes){ for (const [u, w] of [[q.ua, q.ub], [q.ub, q.ua]]){ if (u.kind !== 'car' || w.kind === 'car' || w.hz) continue; const o = u.piece; if (o.gone) continue; const before = o.hp; o.hp -= (q.J - HURT_J) * TOUGH[o.type];
        if (q.J > 9) ev.push(['dent', Math.min(1, q.J / 40), q.x, q.y]); if (before > 0 && o.hp <= 0) breakPiece(o, q.x, q.y, q.J); } }
    pushes.length = 0;
    // welds snap when pulled too hard; axles tear out
    for (const w of welds) if (!w.dead){ const f = w.j.getReactionForce(1 / DT); if (Math.hypot(f.x, f.y) > w.limit){ world.destroyJoint(w.j); w.dead = true; const a = w.j.getAnchorA(); ev.push(['snap', a.x, a.y]); } }
    for (const w of wheels) if (w.j){ const f = w.j.getReactionForce(1 / DT); if (Math.hypot(f.x, f.y) > 2600) dropWheel(w, 'tear'); }
    for (const d of debris) if (!d.gone && d.b.getPosition().y < PIT_Y - 6){ world.destroyBody(d.b); d.gone = true; }
    connect();
    if (!won && power && carX > L.exit){ won = true; wonAt = t; ev.push(['win']); }
    // holding the gas without getting anywhere (nose down in a trench, wedged under a crusher) for 4 s ends the run
    if (!(inp & (KEY.left | KEY.right)) || Math.abs(carX - stuckX) > .6){ stuckX = carX; stuckT = t; }
    if (!power && wreckAt < 0 && !won) wreckAt = t; if (power && !boomed) wreckAt = -1;
    if (!ended){ if (won && t - wonAt > 2.5) ended = 'win'; else if (boomed && t - fuse > 3.5) ended = 'boom'; else if (!boomed && wreckAt >= 0 && t - wreckAt > 3.5) ended = 'wrecked'; else if (!won && t - stuckT > 4) ended = 'stuck'; else if (t > 180) ended = 'timeout'; if (ended) ev.push(['end', ended]); }
    return ev;
  }
  function crush(o, h){ o.flat = true; o.hp = -50; const p = o.b.getPosition(); unweld(o, true); ev.push(['crush', p.x, p.y]); if (o.type === 'tank' && fuse < 0) fuse = t + .3; if (o.type === 'engine') engineDead = true;
    if (o.type === 'glass' || o.type === 'side' || o.type === 'light') return shred(o, 'crush'); if (o.w > MIN_SPLIT * 1.5) split(o, h.x + (rnd() - .5) * .4, p.y, 'crush'); }
  const P = b => { const p = b.getPosition(); return [p.x, p.y, b.getAngle()]; };

  function state(){
    const live = pieces.filter(o => !o.gone), eng = pieces.find(o => o.type === 'engine');
    return { t, won, ended, power, grounded, boomed, fuse: fuse >= 0 && !boomed, engineDead, car: [carX, carY], rpm, integrity: startArea ? area() / startArea : 0, speed: (() => { const c = [...main][0]; return c ? c.b.getLinearVelocity().x : 0; })(),
      pieces: live.map(o => [o.id, TYPES.indexOf(o.type), o.w, o.h, ...P(o.b), Math.max(0, Math.min(1, o.hp / 100)), o.flat ? 1 : 0, main.has(o) ? 1 : 0, o.n]),
      engine: [...P(eng.b), engineDead ? 1 : 0, Math.max(0, Math.min(1, eng.hp / 100))],
      scrape: (() => { let v = 0; for (const o of main) for (let ce = o.b.getContactList(); ce; ce = ce.next){ const u = ce.other.getUserData() || {}; if (ce.contact.isTouching() && (u.kind === 'floor' || u.kind === 'tile')){ const w = o.b.getLinearVelocity(); v = Math.max(v, Math.hypot(w.x, w.y)); } } return v; })(),
      wheels: wheels.map(w => [...P(w.b), w.r, w.j ? 1 : 0, w.popped ? 1 : 0]),
      hazards: hz.map(o => o.h.type === 'mine' ? { armed: o.armAt >= 0, gone: o.gone } : o.b ? { pos: P(o.b) } : {}),
      tiles: tiles.map(o => P(o.b)),
      debris: debris.filter(d => !d.gone).map(d => [...P(d.b), d.k, d.s, d.h]) };
  }
  return { step, state, get t(){ return t; } };
}
