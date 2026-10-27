// Deterministic physics for one run (planck.js / Box2D). Same level + same button presses => same run,
// which is what lets a liked run be replayed exactly when the video is made.
const pl = window.planck;
export const DT = 1 / 60;
export const KEY = { left: 1, right: 2, jump: 4 };

// ---- tuning
const SPEED = 3.6, JUMP = 5.4, ACCEL = 9;            // walking speed (m/s), jump speed, how hard it pushes towards SPEED
const HURT_J = 3, HURT_K = 4;                         // impulse above HURT_J hurts a body part
const RIP_J = 20, POP_J = 15, JOINT_F = 1100;         // impulse that rips a limb off / pops the head off; pull that tears a joint
const BLEED = 9;                                      // blood (out of 100) lost per second per open wound on the body
const MAX_DEBRIS = 140;

// the body: boxes (w, h = half sizes) or a circle (r), hung together by joints at height jy; z = how far in front/behind
export const PARTS = [
  { n: 'torso', w: .17, h: .3, y: 1.15 },
  { n: 'head', r: .14, y: 1.63, p: 0, jy: 1.47, lim: [-.7, .7] },
  { n: 'armB', w: .055, h: .16, y: 1.27, p: 0, jy: 1.42, lim: [-3, 3], z: -.25 },
  { n: 'foreB', w: .05, h: .15, y: .97, p: 2, jy: 1.12, lim: [-2.5, 2.5], z: -.25 },
  { n: 'armF', w: .055, h: .16, y: 1.27, p: 0, jy: 1.42, lim: [-3, 3], z: .25 },
  { n: 'foreF', w: .05, h: .15, y: .97, p: 4, jy: 1.12, lim: [-2.5, 2.5], z: .25 },
  { n: 'thighB', w: .075, h: .21, y: .66, p: 0, jy: .86, lim: [-1.9, 1.9], z: -.1 },
  { n: 'shinB', w: .065, h: .21, y: .24, p: 6, jy: .45, lim: [-2.4, 2.4], z: -.1 },
  { n: 'thighF', w: .075, h: .21, y: .66, p: 0, jy: .86, lim: [-1.9, 1.9], z: .1 },
  { n: 'shinF', w: .065, h: .21, y: .24, p: 8, jy: .45, lim: [-2.4, 2.4], z: .1 },
];

export const pitAt = (L, x) => L.pits.find(p => x > p.x0 && x < p.x1);
const PIT_Y = -3.2;
export { PIT_Y };

export function createSim(L){
  const { World, Vec2, Box, Circle, Polygon, RevoluteJoint, WeldJoint } = pl;
  const world = new World({ gravity: Vec2(0, -10) });
  let seed = 20240917; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let ev = [], t = 0;

  // ---- the building: floor with trenches cut into it, end walls, ceiling
  const [X0, X1] = L.length, building = world.createBody(); building.setUserData({ kind: 'floor' });
  let x = X0; for (const p of [...L.pits].sort((a, b) => a.x0 - b.x0).concat([{ x0: X1, x1: X1 }])){ if (p.x0 > x) building.createFixture(Box((p.x0 - x) / 2, 2, Vec2((x + p.x0) / 2, -2)), { friction: 1 }); x = p.x1; }
  for (const p of L.pits) building.createFixture(Box((p.x1 - p.x0) / 2, .4, Vec2((p.x0 + p.x1) / 2, PIT_Y - .4)), { friction: 1 });
  building.createFixture(Box(.5, 6, Vec2(X0 - .5, 2)), {}); building.createFixture(Box(.5, 6, Vec2(X1 + .5, 2)), {});
  building.createFixture(Box((X1 - X0) / 2 + 1, .3, Vec2((X0 + X1) / 2, L.ceil + .3)), { friction: .6 });
  // spikes at the bottom of every trench
  const spikes = world.createBody(); spikes.setUserData({ kind: 'metal', hz: 'spike' });
  for (const p of L.pits) for (let sx = p.x0 + .25; sx < p.x1 - .1; sx += .45) spikes.createFixture(Polygon([Vec2(sx - .15, PIT_Y), Vec2(sx + .15, PIT_Y), Vec2(sx, PIT_Y + .55)]), { friction: .2 });
  // rotten floor tiles over covered trenches
  const tiles = [];
  for (const p of L.pits.filter(p => p.cover)){ const n = Math.round((p.x1 - p.x0) / .5), w = (p.x1 - p.x0) / n;
    for (let i = 0; i < n; i++){ const b = world.createBody({ position: Vec2(p.x0 + (i + .5) * w, -.125) }); b.createFixture(Box(w / 2 - .005, .125), { density: 2, friction: 1 }); const o = { b, w, dropAt: -1, dropped: false }; b.setUserData({ kind: 'tile', tile: o }); tiles.push(o); } }
  function dropTile(o, kick = 0){ if (o.dropped) return; o.dropped = true; o.b.setType('dynamic'); o.b.resetMassData(); o.b.setAwake(true); if (kick) o.b.setLinearVelocity(Vec2((rnd() - .5) * kick, kick * (.5 + rnd()))); o.b.setAngularVelocity((rnd() - .5) * (2 + kick)); ev.push(['creak', o.b.getPosition().x]); }

  // ---- the character: a ragdoll of 10 parts; no part collides with another part of the same body
  const parts = PARTS.map((P, i) => { const b = world.createBody({ type: 'dynamic', position: Vec2(L.start, P.y), angularDamping: .4 });
    b.createFixture(P.r ? Circle(P.r) : Box(P.w, P.h), { density: 10, friction: .9, filterGroupIndex: -1 });
    const o = { P, i, b, hp: 100, joint: null, cut: false, flat: false, stuck: false, cool: -1 }; b.setUserData({ kind: 'flesh', part: o }); return o; });
  parts.forEach(o => { const P = o.P; if (P.p == null) return; o.joint = world.createJoint(RevoluteJoint({ enableLimit: true, lowerAngle: P.lim[0], upperAngle: P.lim[1], enableMotor: true, maxMotorTorque: 0, motorSpeed: 0 }, parts[P.p].b, o.b, Vec2(L.start, P.jy))); });
  const attached = () => { const a = []; parts.forEach((o, i) => { a[i] = i === 0 || (!!o.joint && a[o.P.p]); }); return a; };
  const stumps = [];  // open wounds: { o: part, local anchor, local direction, rate }
  let impaled = 0, alive = true, deadAt = -1, cause = null, won = false, wonAt = -1, blood = 100, facing = 1, phase = 0, jumpT = -1, grounded = false, ended = null;
  function die(why){ if (!alive) return; alive = false; deadAt = t; cause = why; ev.push(['dead', why]); }
  function sever(o, kind = 'rip'){ if (!o.joint) return; const par = parts[o.P.p], a = o.joint.getAnchorA(); world.destroyJoint(o.joint); o.joint = null; o.cut = true;
    const wound = (q, rate) => { const c = q.b.getPosition(), d = Math.hypot(a.x - c.x, a.y - c.y) || 1; stumps.push({ o: q, lx: q.b.getLocalPoint(a).x, ly: q.b.getLocalPoint(a).y, dir: q.b.getLocalVector(Vec2((a.x - c.x) / d, (a.y - c.y) / d)), rate }); };
    const neck = o.P.n === 'head'; wound(par, neck ? 2.2 : 1); wound(o, neck ? 1 : .6);
    const v = o.b.getLinearVelocity(); ev.push(['sever', a.x, a.y, v.x, v.y, o.i, kind]); if (neck) die('head'); }
  // everything hanging off a part is cut too when that part is crushed
  const children = o => parts.filter(q => q.P.p === o.i);

  // ---- traps
  const hz = L.hazards.map(h => {
    if (h.type === 'crusher'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.x, crY(h, 0)) }); b.setUserData({ kind: 'metal', hz: 'crusher' }); b.createFixture(Box(h.w / 2, .6), { friction: .6 }); return { h, b, down: false }; }
    if (h.type === 'saw'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.path[0][0], h.path[0][1]) }); b.setUserData({ kind: 'metal', hz: 'saw' }); b.setAngularVelocity(-h.spin);
      b.createFixture(Circle(h.r * .82), { friction: .2, restitution: .4 }); for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, a2 = a + .3; b.createFixture(Polygon([Vec2(Math.cos(a) * h.r * .8, Math.sin(a) * h.r * .8), Vec2(Math.cos(a + .18) * h.r * 1.12, Math.sin(a + .18) * h.r * 1.12), Vec2(Math.cos(a2) * h.r * .8, Math.sin(a2) * h.r * .8)]), { restitution: .4 }); }
      return { h, b }; }
    if (h.type === 'mine'){ const b = world.createBody({ position: Vec2(h.x, .04) }); b.setUserData({ kind: 'mine', mine: null }); b.createFixture(Circle(.55), { isSensor: true }); const o = { h, b, armAt: -1, gone: false }; b.getUserData().mine = o; return o; }
    return { h }; });
  function crY(h, tt){ const u = (((tt + h.phase) / h.period) % 1 + 1) % 1, top = L.ceil - .6, bot = .6, ease = k => k * k * (3 - 2 * k);
    if (u < .5) return top; if (u < .58){ const k = (u - .5) / .08; return top - (top - bot) * k * k; } if (u < .72) return bot; return bot + (top - bot) * ease((u - .72) / .28); }

  // ---- debris: concrete chunks (1), ceiling tiles (0) and gore (2)
  const debris = [];
  function spawn(kind, x, y, vx, vy){ if (debris.filter(d => !d.gone).length >= MAX_DEBRIS) return; const b = world.createBody({ type: 'dynamic', position: Vec2(x, y), angle: rnd() * 6 });
    let s, h = 0; if (kind === 0){ s = .18 + rnd() * .14; h = .025; b.createFixture(Box(s, h), { density: 1, friction: .6, restitution: .2 }); }
    else { s = (kind === 2 ? .05 : .07) + rnd() * .08; const pts = []; for (let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2 + rnd() * .4; pts.push(Vec2(Math.cos(a) * s * (.7 + rnd() * .5), Math.sin(a) * s * (.7 + rnd() * .5))); } b.createFixture(Polygon(pts), { density: kind === 2 ? 1.2 : 2.5, friction: .8, restitution: kind === 2 ? .05 : .15 }); }
    b.setUserData({ kind: kind === 2 ? 'gib' : kind === 1 ? 'rock' : 'panel' }); b.setLinearVelocity(Vec2(vx, vy)); b.setAngularVelocity((rnd() - .5) * 20); debris.push({ b, k: kind, s, h }); }
  function gibs(x, y, n, kick){ for (let i = 0; i < n; i++){ const a = rnd() * Math.PI * 2; spawn(2, x + (rnd() - .5) * .3, y + (rnd() - .5) * .3, Math.cos(a) * kick * rnd(), Math.abs(Math.sin(a)) * kick * rnd() + 1); } }

  function explode(x, y){ ev.push(['boom', x, y]);
    for (const o of parts){ const p = o.b.getPosition(), d = Math.hypot(p.x - x, p.y - y); if (d < 2.4){ o.hp -= 130 * (1 - d / 2.4); if (o.joint && rnd() < 1.3 - d / 1.8) sever(o, 'boom'); } }
    if (parts[0].hp <= 0){ die('boom'); const p = parts[0].b.getPosition(); gibs(p.x, p.y, 10, 7); ev.push(['squish', p.x, p.y, 1]); }
    for (const o of tiles) if (Math.abs(o.b.getPosition().x - x) < 2.2) dropTile(o, 6);
    for (let b = world.getBodyList(); b; b = b.getNext()){ if (!b.isDynamic()) continue; const p = b.getPosition(), dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy); if (d > 4 || d < 1e-3) continue;
      const k = (1 - d / 4) * 9 * b.getMass(); b.applyLinearImpulse(Vec2(dx / d * k, (Math.max(0, dy / d) + .9) * k), p, true); }
    for (let i = 0; i < 8; i++) spawn(1, x + (rnd() - .5) * 1.2, .1, (rnd() - .5) * 9, 3 + rnd() * 7);
    for (let i = 0; i < 5; i++) spawn(0, x + (rnd() - .5) * 3, L.ceil - .1, (rnd() - .5) * 2, -rnd() * 2);
    ev.push(['crumble', x, L.ceil, .8]); }

  // ---- contacts: collect during the step, act after it (Box2D forbids changes mid-step)
  const touches = [], pushes = [];
  world.on('begin-contact', c => { const fa = c.getFixtureA(), fb = c.getFixtureB(), A = fa.getBody(), B = fb.getBody(), ua = A.getUserData() || {}, ub = B.getUserData() || {};
    if (fa.isSensor() || fb.isSensor()){ const m = ua.kind === 'mine' ? ua.mine : ub.kind === 'mine' ? ub.mine : null, other = ua.kind === 'mine' ? B : A; if (m && other.isDynamic() && m.armAt < 0 && !m.gone){ m.armAt = t; ev.push(['click', m.h.x]); } return; }
    if (!c.getManifold().pointCount) return; const wm = c.getWorldManifold(null), p = wm.points[0], n = wm.normal, va = A.getLinearVelocityFromWorldPoint(p), vb = B.getLinearVelocityFromWorldPoint(p);
    touches.push({ A, B, ua, ub, x: p.x, y: p.y, v: Math.abs((vb.x - va.x) * n.x + (vb.y - va.y) * n.y), tx: vb.x - va.x, ty: vb.y - va.y }); });
  world.on('post-solve', (c, imp) => { const J = (imp.normalImpulses[0] || 0) + (imp.normalImpulses[1] || 0); if (J < HURT_J) return;
    const A = c.getFixtureA().getBody(), B = c.getFixtureB().getBody(), wm = c.getWorldManifold(null), p = wm.points[0]; pushes.push({ ua: A.getUserData() || {}, ub: B.getUserData() || {}, J, x: p.x, y: p.y }); });
  const MAT = { flesh: 'flesh', gib: 'flesh', metal: 'metal', floor: 'stone', rock: 'rock', tile: 'stone', panel: 'plate' };

  // ---- the controller: an invisible spring holds the body up while it has legs, a torque keeps it upright,
  // the hip/knee/shoulder motors play a walk cycle. Once dead, everything goes limp.
  function control(inp, att){
    const torso = parts[0].b, p = torso.getPosition(), v = torso.getLinearVelocity(), dir = (inp & KEY.right ? 1 : 0) - (inp & KEY.left ? 1 : 0);
    const legs = [6, 8].filter(i => att[i] && att[i + 1]).length, M = parts.reduce((m, o, i) => m + (att[i] ? o.b.getMass() : 0), 0);
    let g = null; world.rayCast(Vec2(p.x, p.y), Vec2(p.x, p.y - 1.7), (f, pt, n, fr) => { const u = f.getBody().getUserData() || {}; if (u.kind === 'flesh' || f.isSensor()) return -1; g = fr * 1.7; return fr; });
    const able = alive && !won; grounded = able && legs > 0 && g != null && g < 1.45;
    if (able && dir) facing = dir;
    if (able){
      if (grounded){ const k = legs === 2 ? 1 : .8; torso.applyForceToCenter(Vec2(0, Math.min(M * 40, Math.max(0, M * (10 * k + 90 * (1.15 - g) - 14 * v.y)))), true); }
      const target = dir * SPEED * (legs === 2 ? 1 : legs ? .6 : .25), fx = M * ACCEL * (target - v.x) * (grounded ? 1 : legs ? .35 : (g != null && g < .7 ? .6 : .1));
      torso.applyForceToCenter(Vec2(Math.max(-M * 25, Math.min(M * 25, fx)), 0), true);
      const a = Math.atan2(Math.sin(torso.getAngle()), Math.cos(torso.getAngle())); torso.applyTorque(-(a * 90 + torso.getAngularVelocity() * 12) * (legs ? 1 : .35), true);
      if (inp & KEY.jump && grounded && t - jumpT > .4){ jumpT = t; parts.forEach((o, i) => { if (att[i]){ const w = o.b.getLinearVelocity(); o.b.setLinearVelocity(Vec2(w.x, JUMP * (legs === 2 ? 1 : .7))); } }); ev.push(['jump', p.x, p.y]); }
    } else if (won){ const fx = -M * ACCEL * v.x; torso.applyForceToCenter(Vec2(fx, 0), true); if (grounded) torso.applyForceToCenter(Vec2(0, M * 10), true); }
    // walk cycle
    const moving = grounded && Math.abs(v.x) > .3, f = facing; if (moving){ const ph = phase; phase += Math.abs(v.x) * DT * 4.2; if (Math.floor(ph / Math.PI) !== Math.floor(phase / Math.PI)) ev.push(['step', p.x, Math.abs(v.x)]); }
    const s = Math.sin(phase), air = able && !grounded && legs > 0;
    const pose = { head: 0, armB: moving ? -.6 * s * f : air ? 2.2 * f : .1 * f, foreB: moving ? .5 * f : air ? .3 * f : .25 * f, armF: moving ? .6 * s * f : air ? 2.5 * f : -.1 * f, foreF: moving ? .5 * f : air ? .3 * f : .25 * f,
      thighB: moving ? .65 * s * f : air ? .9 * f : 0, shinB: moving ? -f * (.15 + .9 * Math.max(0, Math.sin(phase + 1.6))) : air ? -1.3 * f : -.05 * f,
      thighF: moving ? -.65 * s * f : air ? .2 * f : 0, shinF: moving ? -f * (.15 + .9 * Math.max(0, Math.sin(phase + 1.6 + Math.PI))) : air ? -.4 * f : -.05 * f };
    for (const o of parts){ const j = o.joint; if (!j) continue; const T = !able ? .4 : o.P.n.startsWith('thigh') || o.P.n.startsWith('shin') ? 60 : o.P.n === 'head' ? 8 : 14;
      j.setMaxMotorTorque(T); j.setMotorSpeed(able ? Math.max(-14, Math.min(14, (pose[o.P.n] - j.getJointAngle()) * 12)) : 0); }
  }

  function step(inp = 0){
    ev = []; const att = attachedList(); control(inp, att);
    // traps move
    for (const o of hz){ const h = o.h;
      if (h.type === 'crusher'){ const y0 = o.b.getPosition().y, y1 = crY(h, t + DT); o.b.setLinearVelocity(Vec2(0, (y1 - y0) / DT)); const bottom = y1 - .6;
        if (y1 < y0 - .01 && bottom < 1.9) for (const q of parts){ const p = q.b.getPosition(), half = q.P.r || q.P.h; if (!q.flat && Math.abs(p.x - h.x) < h.w / 2 + .02 && p.y < y0 && p.y > -.2 && bottom < p.y + half * .3){ squash(q, h.x); } }
        if (y1 <= .6 + 1e-4 && y0 > .6 + 1e-4){ ev.push(['slam', h.x, 0, 1]); for (let i = 0; i < 3; i++) spawn(1, h.x + (rnd() < .5 ? -1 : 1) * (h.w / 2 + .1), .15, (rnd() - .5) * 5, 2 + rnd() * 3); } }
      if (h.type === 'saw'){ const w = 2 * Math.PI / h.period, du = .5 * w * Math.sin(w * t), [p0, p1] = h.path; o.b.setLinearVelocity(Vec2((p1[0] - p0[0]) * du, (p1[1] - p0[1]) * du)); }
      if (h.type === 'mine' && o.armAt >= 0 && !o.gone && t - o.armAt > .22){ o.gone = true; world.destroyBody(o.b); explode(h.x, .1); } }
    for (const o of tiles) if (!o.dropped && o.dropAt >= 0 && t >= o.dropAt) dropTile(o);
    world.step(DT, 8, 3); t += DT;

    // contacts: saws cut, spikes impale, everything else is a bump (sound)
    let sounds = 0;
    for (const c of touches){ for (const [u, w, B] of [[c.ua, c.ub, c.B], [c.ub, c.ua, c.A]]){ if (u.kind !== 'flesh') continue; const o = u.part;
        if (w.hz === 'saw' && t - o.cool > .15){ o.cool = t; ev.push(['cut', c.x, c.y, c.tx, c.ty]); if (o.joint) sever(o, 'saw'); else { const kid = children(o).filter(k => k.joint).sort((a, b) => dist(a, c) - dist(b, c))[0]; if (kid && dist(kid, c) < .4) sever(kid, 'saw'); o.hp -= 45; } }
        if (w.hz === 'spike' && !o.stuck){ o.stuck = true; o.hp -= 60; world.createJoint(WeldJoint({}, B, o.b, Vec2(c.x, c.y))); ev.push(['impale', c.x, c.y]); impaled++;
          const l = o.b.getLocalPoint(Vec2(c.x, c.y)); stumps.push({ o, lx: l.x, ly: l.y, dir: o.b.getLocalVector(Vec2(0, 1)), rate: .8 }); if (o.i <= 1 || impaled >= 2) die('spikes'); }
        if (w.kind === 'tile' && w.tile.dropAt < 0) w.tile.dropAt = t + .22; }
      if (c.v > 1.2 && sounds < 6){ const last = Math.max(c.ua.lastHit ?? -1, c.ub.lastHit ?? -1); if (t - last > .09){ c.ua.lastHit = c.ub.lastHit = t; sounds++; ev.push(['hit', MAT[c.ua.kind] || 'stone', MAT[c.ub.kind] || 'stone', c.v, c.x, c.y]); } } }
    touches.length = 0;
    // hard knocks hurt, rip limbs off and pop heads
    for (const q of pushes){ for (const [u, w] of [[q.ua, q.ub], [q.ub, q.ua]]){ if (u.kind !== 'flesh' || w.kind === 'flesh' || w.hz === 'spike') continue; const o = u.part; o.hp -= (q.J - HURT_J) * HURT_K;
        if (q.J > 6) ev.push(['splat', q.x, q.y, Math.min(1, q.J / 30)]);
        if (o.P.n === 'head' && q.J > POP_J && o.joint){ sever(o, 'pop'); gibs(q.x, q.y, 4, 3); }
        else if (q.J > RIP_J && o.joint) sever(o, 'rip'); } }
    pushes.length = 0;
    // joints tear when pulled too hard
    for (const o of parts) if (o.joint){ const f = o.joint.getReactionForce(1 / DT); if (Math.hypot(f.x, f.y) > JOINT_F * (o.P.n === 'head' ? .7 : 1)) sever(o, 'tear'); }
    if (alive && parts[0].hp <= 0){ const p = parts[0].b.getPosition(); die('splat'); gibs(p.x, p.y, 6, 4); ev.push(['squish', p.x, p.y, .7]); }
    if (alive && parts[1].hp <= 0 && parts[1].joint){ sever(parts[1], 'pop'); }
    // bleeding out: every open wound still on the body drains blood
    const att2 = attachedList(); if (alive){ for (const s of stumps) if (att2[s.o.i]) blood -= s.rate * BLEED * DT; if (blood <= 0){ blood = 0; die('blood'); } }
    for (const d of debris) if (!d.gone && d.b.getPosition().y < PIT_Y - 6){ world.destroyBody(d.b); d.gone = true; }
    const p = parts[0].b.getPosition();
    if (alive && !won && p.x > L.exit){ won = true; wonAt = t; ev.push(['win']); }
    if (alive && p.y < PIT_Y - 3) die('fall');
    if (!ended){ if (won && t - wonAt > 2.5) ended = 'win'; else if (!alive && t - deadAt > 3.2) ended = 'dead'; else if (t > 180) ended = 'timeout'; if (ended) ev.push(['end', ended]); }
    return ev;
  }
  const dist = (o, c) => { const a = o.joint.getAnchorA(); return Math.hypot(a.x - c.x, a.y - c.y); };
  function squash(o, hx){ o.flat = true; o.hp = -100; const p = o.b.getPosition(); for (const q of [o, ...children(o)]) sever(q, 'crush'); ev.push(['squish', p.x, p.y, o.i === 0 ? 1 : .5]);
    gibs(p.x, p.y + .1, o.i === 0 ? 8 : 2, 5); o.b.setLinearVelocity(Vec2((p.x < hx ? -1 : 1) * 3, 0)); if (o.i <= 1) die('crushed'); }
  function attachedList(){ return attached(); }
  const P = b => { const p = b.getPosition(); return [p.x, p.y, b.getAngle()]; };

  function state(){ const att = attached();
    return { t, alive, won, cause, blood, facing, grounded, ended, speed: parts[0].b.getLinearVelocity().x,
      parts: parts.map((o, i) => [...P(o.b), att[i] ? 1 : 0, o.flat ? 1 : 0, o.cut ? 1 : 0]),
      wounds: stumps.map(s => { const b = s.o.b, a = b.getWorldPoint(Vec2(s.lx, s.ly)), d = b.getWorldVector(s.dir), v = b.getLinearVelocity(); return [a.x, a.y, Math.atan2(d.y, d.x), s.rate * (att[s.o.i] && alive ? 1 : .35), v.x, v.y, s.o.i]; }),
      hazards: hz.map(o => o.h.type === 'mine' ? { armed: o.armAt >= 0, gone: o.gone } : o.b ? { pos: P(o.b) } : {}),
      tiles: tiles.map(o => P(o.b)),
      debris: debris.filter(d => !d.gone).map(d => [...P(d.b), d.k, d.s, d.h]) };
  }
  return { step, state, get t(){ return t; } };
}
