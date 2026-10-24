// Deterministic physics for one run (planck.js / Box2D). Same level + same strokes => same result,
// which is what lets a liked run be replayed exactly when the video is made.
const pl = window.planck;
export const DT = 1 / 60;

// ---- tuning
const EDGE = 2.4, DEPTH = 2.4, BLK = .6;          // breakable blocks along every open cliff edge
const CAR_J = 7, CAR_K = 2.2;                       // car damage: impulse above CAR_J hurts
const BLOCK_J = 26;                                 // impulse that cracks a cliff block
const ANCHOR_F = 900, LINK_F = 700;                 // force (N) that rips a drawing off the cliff / apart
const HAZ_DMG = { saw: 45, spike: 30, bullet: 24 };
const MAX_ROCKS = 70;

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

export function createSim(level, rawStrokes){
  const { World, Vec2, Box, Circle, Polygon, WheelJoint, WeldJoint } = pl;
  const world = new World({ gravity: Vec2(0, -10) });
  let seed = 20240917; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let ev = [];

  // ---- terrain
  const T = terrain(level), blocks = [], low = lowest(level), FLOOR = floorY(level);
  const core = world.createBody(); core.setUserData({ kind: 'stone' });
  for (const s of T){
    for (const c of s.core) core.createFixture(Box((c.x1 - c.x0) / 2, (c.y1 - c.y0) / 2, Vec2((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2), 0), { friction: .9 });
    for (const b of s.blocks){ const body = world.createBody({ position: Vec2(b.x, b.y) }); body.createFixture(Box(b.w / 2 - .005, b.h / 2 - .005), { friction: .9, density: 2.4 });
      const o = { kind: 'block', b, body, broken: false }; body.setUserData(o); blocks.push(o); } }
  if (FLOOR != null) core.createFixture(Box(60, 5, Vec2(0, FLOOR - 5), 0), { friction: .9 });

  // ---- the drawing: every stroke is its own rigid body with weight; it sticks where it touches a cliff or another stroke
  const strokes = rawStrokes.map(s => s.map(p => fitPoint(level, p[0], p[1])));
  const inks = strokes.map(s => { const b = world.createBody({ type: 'dynamic' }); b.setUserData({ kind: 'ink' }); let n = 0;
    for (let i = 1; i < s.length; i++){ const [x0, y0] = s[i - 1], [x1, y1] = s[i], L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-3) continue;
      b.createFixture(Box(L / 2 + .04, .07, Vec2((x0 + x1) / 2, (y0 + y1) / 2), Math.atan2(y1 - y0, x1 - x0)), { density: 1.2, friction: .9 }); n++; }
    if (!n) b.createFixture(Circle(Vec2(s[0][0], s[0][1]), .09), { density: 1.2, friction: .8 });
    return b; });
  const surfDist = (x, y) => { let d = 1e9; for (const s of T){ const dx = Math.max(s.x0 - x, 0, x - s.x1), dy = Math.max(0, y - s.top); d = Math.min(d, Math.hypot(dx, dy)); } if (FLOOR != null) d = Math.min(d, y - FLOOR); return d; };
  const anchorBody = (x, y) => { let best = null, bd = .45; for (const o of blocks){ const b = o.b, d = Math.hypot(Math.max(Math.abs(x - b.x) - b.w / 2, 0), Math.max(Math.abs(y - b.y) - b.h / 2, 0)); if (d < bd){ bd = d; best = o.body; } } return best || core; };
  const joints = [];
  strokes.forEach((s, si) => { const touch = []; s.forEach((p, k) => { if (surfDist(p[0], p[1]) < .3) touch.push(k); });
    if (!touch.length) return; const pick = [touch[0]], last = touch[touch.length - 1];
    if (Math.hypot(s[last][0] - s[touch[0]][0], s[last][1] - s[touch[0]][1]) > .8) pick.push(last);
    for (const k of pick){ const [x, y] = s[k]; joints.push({ j: world.createJoint(WeldJoint({}, inks[si], anchorBody(x, y), Vec2(x, y))), limit: ANCHOR_F }); } });
  for (let a = 0; a < strokes.length; a++) for (let b = a + 1; b < strokes.length; b++){ let hit = null;
    for (const p of strokes[b]){ for (const q of strokes[a]) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < .22){ hit = p; break; } if (hit) break; }
    if (hit) joints.push({ j: world.createJoint(WeldJoint({}, inks[a], inks[b], Vec2(hit[0], hit[1]))), limit: LINK_F }); }

  // ---- the car: chassis + cabin (welded, can be knocked off) + two motorised wheels (can come off)
  const [cx, cy] = level.car;
  const car = world.createBody({ type: 'dynamic', position: Vec2(cx, cy) }); car.setUserData({ kind: 'car' });
  car.createFixture(Box(.85, .22, Vec2(0, -.05), 0), { density: 2.2, friction: .4 });
  const cabin = world.createBody({ type: 'dynamic', position: Vec2(cx, cy) }); cabin.setUserData({ kind: 'car' });
  cabin.createFixture(Box(.45, .16, Vec2(-.1, .34), 0), { density: .5, friction: .4 });
  let cabinJ = world.createJoint(WeldJoint({}, car, cabin, Vec2(cx - .1, cy + .2)));
  const wheels = [-.55, .55].map(x => { const w = world.createBody({ type: 'dynamic', position: Vec2(cx + x, cy - .37) }); w.setUserData({ kind: 'wheel' }); w.createFixture(Circle(.3), { density: 1.2, friction: 1.4 });
    const j = world.createJoint(WheelJoint({ motorSpeed: 0, maxMotorTorque: 9, enableMotor: true, frequencyHz: 4, dampingRatio: .7 }, car, w, w.getPosition(), Vec2(0, 1))); return { w, j, on: true }; });
  const isCar = u => u && (u.kind === 'car' || u.kind === 'wheel');

  // ---- hazards
  const hz = (level.hazards || []).map(h => {
    if (h.type === 'spinner'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.x, h.y) }); b.setUserData({ kind: 'metal', hz: 'spike' }); b.setAngularVelocity(-h.spin); b.createFixture(Circle(.55), { friction: .3 });
      for (let k = 0; k < h.arms; k++){ const a = k / h.arms * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); b.createFixture(Box(h.len / 2, .14, Vec2(c * h.len / 2, s * h.len / 2), a), { friction: .3, restitution: .4 });
        b.createFixture(Polygon([Vec2(c * h.len - s * .3, s * h.len + c * .3), Vec2(c * (h.len + .55), s * (h.len + .55)), Vec2(c * h.len + s * .3, s * h.len - c * .3)]), { restitution: .6 }); }
      return { h, b, bullets: [], next: h.shots ? h.shots.first : 1e9 }; }
    if (h.type === 'saw'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.path[0][0], h.path[0][1]) }); b.setUserData({ kind: 'metal', hz: 'saw' }); b.setAngularVelocity(-h.spin);
      b.createFixture(Circle(h.r * .82), { friction: .2, restitution: .5 }); for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, a2 = a + .3; b.createFixture(Polygon([Vec2(Math.cos(a) * h.r * .8, Math.sin(a) * h.r * .8), Vec2(Math.cos(a + .18) * h.r * 1.12, Math.sin(a + .18) * h.r * 1.12), Vec2(Math.cos(a2) * h.r * .8, Math.sin(a2) * h.r * .8)]), { restitution: .5 }); }
      return { h, b }; }
    return { h }; });

  // ---- debris (rocks from the cliff, panels from the car)
  const debris = [];
  function spawnRock(x, y, kick){ if (debris.filter(d => !d.gone && d.k === 1).length >= MAX_ROCKS) return; const r = .07 + rnd() * .1, n = 5, pts = [];
    for (let i = 0; i < n; i++){ const a = i / n * Math.PI * 2 + rnd() * .4; pts.push(Vec2(Math.cos(a) * r * (.7 + rnd() * .5), Math.sin(a) * r * (.7 + rnd() * .5))); }
    const b = world.createBody({ type: 'dynamic', position: Vec2(x, y), angle: rnd() * 6 }); b.setUserData({ kind: 'rock' }); b.createFixture(Polygon(pts), { density: 2.5, friction: .8, restitution: .15 });
    const a = rnd() * Math.PI * 2; b.setLinearVelocity(Vec2(Math.cos(a) * kick * rnd(), Math.abs(Math.sin(a)) * kick * rnd() + 1)); b.setAngularVelocity((rnd() - .5) * 20); debris.push({ b, k: 1, s: r }); }
  function breakBlock(o, sx, sy, kick){ if (o.broken) return; o.broken = true; const b = o.body; b.setType('dynamic'); b.resetMassData(); b.setAwake(true); o.kind = 'rock';
    const p = b.getPosition(), dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1; b.setLinearVelocity(Vec2(dx / d * kick * .4, dy / d * kick * .4 + .5)); b.setAngularVelocity((rnd() - .5) * 3);
    for (let i = 0; i < 3; i++) spawnRock(p.x + (rnd() - .5) * o.b.w, p.y + (rnd() - .5) * o.b.h, kick * .8);
    ev.push(['crumble', p.x, p.y, Math.min(1, kick / 8)]); }

  // ---- contacts: collect during the step, act after it (Box2D forbids changes mid-step)
  const hits = [], pushes = [];
  world.on('begin-contact', c => { if (!c.getManifold().pointCount) return; const A = c.getFixtureA().getBody(), B = c.getFixtureB().getBody(), wm = c.getWorldManifold(null), p = wm.points[0], n = wm.normal;
    const va = A.getLinearVelocityFromWorldPoint(p), vb = B.getLinearVelocityFromWorldPoint(p);
    hits.push({ A, B, ua: A.getUserData() || {}, ub: B.getUserData() || {}, x: p.x, y: p.y, v: Math.abs((vb.x - va.x) * n.x + (vb.y - va.y) * n.y) }); });
  world.on('post-solve', (c, imp) => { const J = (imp.normalImpulses[0] || 0) + (imp.normalImpulses[1] || 0); if (J < 4) return;
    const A = c.getFixtureA().getBody(), B = c.getFixtureB().getBody(), wm = c.getWorldManifold(null), p = wm.points[0]; pushes.push({ ua: A.getUserData() || {}, ub: B.getUserData() || {}, J, x: p.x, y: p.y }); });
  const MAT = { car: 'metal', wheel: 'tire', ink: 'ink', block: 'stone', stone: 'stone', rock: 'rock', metal: 'metal', bullet: 'metal', panel: 'metal' };

  const prevVs = new Map(), hzCool = {}; let t = 0, hp = 100, fire = false, fireAt = -1, exploded = false, boomAt = -1, won = false, wonAt = -1, fellAt = -1, prog = { x: -1e9, y: 1e9, t: 0 }, prevV = null, ended = null, pieces = 0;
  function damage(d, x, y){ if (exploded || d <= 0) return; hp -= d; if (d >= 6) ev.push(['dent', Math.min(1, d / 40), x, y]); }
  function explode(x, y){ exploded = true; boomAt = t; hp = 0; ev.push(['boom', x, y]);
    wheels.forEach(o => { if (o.on){ world.destroyJoint(o.j); o.on = false; } }); if (cabinJ){ world.destroyJoint(cabinJ); cabinJ = null; }
    for (let i = 0; i < 9; i++){ const b = world.createBody({ type: 'dynamic', position: Vec2(x + (rnd() - .5) * .9, y + rnd() * .4), angle: rnd() * 6 }); b.setUserData({ kind: 'panel' });
      const w = .1 + rnd() * .14, h = .035 + rnd() * .05; b.createFixture(Box(w, h), { density: 2, friction: .6, restitution: .25 }); const a = rnd() * Math.PI, sp = 4 + rnd() * 7;
      b.setLinearVelocity(Vec2(Math.cos(a) * sp, Math.sin(a) * sp)); b.setAngularVelocity((rnd() - .5) * 30); debris.push({ b, k: 0, s: w, h }); }
    for (let b = world.getBodyList(); b; b = b.getNext()){ if (!b.isDynamic()) continue; const p = b.getPosition(), dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy); if (d > 3.5 || d < 1e-3) continue;
      const k = (1 - d / 3.5) * 8 * b.getMass(); b.applyLinearImpulse(Vec2(dx / d * k, (dy / d + .5) * k), p, true); }
    for (const o of blocks) if (!o.broken && Math.hypot(o.b.x - x, o.b.y - y) < 1.9) breakBlock(o, x, y, 7);
    // the blast also tears rock out of nearby cliff walls and the canyon floor
    for (const sd of T) for (const [fx, open, dir] of [[sd.x0, sd.openL, -1], [sd.x1, sd.openR, 1]]){ if (!open || Math.abs(fx - x) > 2.6 || y > sd.top) continue;
      for (let i = 0; i < 9; i++) spawnRock(fx + dir * .15, Math.min(sd.top - .1, y - .5 + rnd() * 2.5), 6); ev.push(['crumble', fx, y + .6, 1]); }
    if (FLOOR != null && y - FLOOR < 1.5){ for (let i = 0; i < 7; i++) spawnRock(x + (rnd() - .5) * 1.4, FLOOR + .15, 7); ev.push(['crumble', x, FLOOR + .2, .8]); }
    for (const o of joints) if (!o.dead){ const a = o.j.getAnchorA(); if (Math.hypot(a.x - x, a.y - y) < 2.5){ world.destroyJoint(o.j); o.dead = true; ev.push(['snap', a.x, a.y]); } } }
  const P = b => { const p = b.getPosition(); return [p.x, p.y, b.getAngle()]; };

  function step(){
    ev = [];
    const go = t >= .4; wheels.forEach(({ j, on }) => on && j.setMotorSpeed(go && !won ? -level.speed : 0));
    for (const o of hz){ const h = o.h;
      if (h.type === 'spinner' && h.shots && t >= o.next){ const k = o.bullets.length, ang = h.shots.angles[k % h.shots.angles.length];
        const b = world.createBody({ type: 'dynamic', bullet: true, position: Vec2(h.x + Math.sin(ang) * .7, h.y + Math.cos(ang) * .7), angle: -ang }); b.setUserData({ kind: 'bullet' });
        b.createFixture(Polygon([Vec2(-.09, -.28), Vec2(.09, -.28), Vec2(0, .34)]), { density: 4, restitution: .3 }); b.setLinearVelocity(Vec2(Math.sin(ang) * h.shots.speed, Math.cos(ang) * h.shots.speed));
        o.bullets.push({ b, t0: t }); o.next += h.shots.every; ev.push(['shot', h.x, h.y]); }
      if (h.type === 'saw'){ const w = 2 * Math.PI / h.period, du = .5 * w * Math.sin(w * t), [p0, p1] = h.path; o.b.setLinearVelocity(Vec2((p1[0] - p0[0]) * du, (p1[1] - p0[1]) * du)); }
      if (h.type === 'fan'){ const [dx, dy] = h.dir; for (const b of [car, cabin, ...wheels.map(o => o.w), ...inks, ...debris.filter(d => !d.gone).map(d => d.b)]){ const p = b.getPosition(), rx = p.x - h.x, ry = p.y - h.y, along = rx * dx + ry * dy, side = Math.abs(rx * -dy + ry * dx);
          if (along > 0 && along < h.length && side < h.width / 2){ const f = h.power * b.getMass() * (1 - along / h.length * .6); b.applyForceToCenter(Vec2(dx * f, dy * f), true); } } } }
    world.step(DT, 8, 3); t += DT;

    // impacts -> sounds, hazard damage, chipped cliffs
    let sounds = 0;
    for (const h of hits){ const { ua, ub } = h, ca = isCar(ua), cb = isCar(ub);
      const hzk = ca ? (ub.hz || (ub.kind === 'bullet' && 'bullet')) : cb ? (ua.hz || (ua.kind === 'bullet' && 'bullet')) : null;
      if (hzk){ ev.push(['spark', h.x, h.y]); if (t - (hzCool[hzk] ?? -1) > .3){ hzCool[hzk] = t; damage(HAZ_DMG[hzk], h.x, h.y); } }
      if (ua.kind === 'bullet' && ub.kind === 'block' && h.v > 8) breakBlock(ub, h.x, h.y, 3);
      if (ub.kind === 'bullet' && ua.kind === 'block' && h.v > 8) breakBlock(ua, h.x, h.y, 3);
      if (h.v > 1.2 && sounds < 6){ const last = Math.max(ua.lastHit ?? -1, ub.lastHit ?? -1); if (t - last > .09){ ua.lastHit = ub.lastHit = t; sounds++; ev.push(['hit', MAT[ua.kind] || 'stone', MAT[ub.kind] || 'stone', h.v, h.x, h.y]); } } }
    hits.length = 0;
    // hard pushes -> car damage and cracked cliffs
    let carJ = 0, cx2 = 0, cy2 = 0;
    for (const p of pushes){ if (p.ua.kind === 'bullet' || p.ub.kind === 'bullet' || p.ua.kind === 'ink' || p.ub.kind === 'ink') continue; if ((isCar(p.ua) || isCar(p.ub)) && p.J > carJ){ carJ = p.J; cx2 = p.x; cy2 = p.y; }
      for (const u of [p.ua, p.ub]) if (u.kind === 'block' && !u.broken && p.J > BLOCK_J){ breakBlock(u, p.x, p.y + 1, Math.min(6, p.J / 8));
        for (const o of blocks) if (!o.broken && Math.hypot(o.b.x - u.b.x, o.b.y - u.b.y) < (p.J > BLOCK_J * 2 ? 1 : .65)) breakBlock(o, p.x, p.y + 1, 3); } }
    pushes.length = 0;
    if (carJ > CAR_J) damage((carJ - CAR_J) * CAR_K, cx2, cy2);
    // sudden stops hurt too (landing from a height, slamming into a wall)
    let dvMax = 0; for (const b of [car, cabin, ...wheels.filter(o => o.on).map(o => o.w)]){ const v = b.getLinearVelocity(), pv = prevVs.get(b); if (pv) dvMax = Math.max(dvMax, Math.hypot(v.x - pv.x, v.y - pv.y)); prevVs.set(b, { x: v.x, y: v.y }); }
    if (dvMax > 5){ const p = car.getPosition(); damage((dvMax - 5) * 9, p.x, p.y); }
    // the car falls apart as it gets hurt
    if (!exploded){
      if (hp < 50 && cabinJ){ world.destroyJoint(cabinJ); cabinJ = null; cabin.applyLinearImpulse(Vec2(-.3, 1.2), cabin.getWorldPoint(Vec2(.2, .3)), true); ev.push(['partoff', ...P(cabin)]); }
      if (hp < 35 && wheels[1].on){ world.destroyJoint(wheels[1].j); wheels[1].on = false; ev.push(['partoff', ...P(wheels[1].w)]); }
      if (hp < 25 && !fire){ fire = true; fireAt = t; ev.push(['fire']); }
      if (hp <= -20 || (fire && t - fireAt > 2.2)){ const p = car.getPosition(); explode(p.x, p.y); } }
    // drawings rip off when pulled too hard
    for (const o of joints) if (!o.dead){ const f = o.j.getReactionForce(1 / DT), tq = Math.abs(o.j.getReactionTorque(1 / DT));
      if (Math.hypot(f.x, f.y) > o.limit || tq > o.limit * 1.5){ const a = o.j.getAnchorA(); world.destroyJoint(o.j); o.dead = true; ev.push(['snap', a.x, a.y]); } }
    // tidy up debris that fell out of the world
    for (const d of debris) if (!d.gone && d.b.getPosition().y < low - 45){ world.destroyBody(d.b); d.gone = true; }

    const p = car.getPosition(), v = car.getLinearVelocity(), ang = car.getAngle();
    if (prevV){ const dv = Math.hypot(v.x - prevV.x, v.y - prevV.y); if (dv > 4.5) ev.push(['crash', Math.min(1, dv / 14), p.x, p.y]); } prevV = { x: v.x, y: v.y };
    if (!won && !exploded && Math.abs(p.x - level.flag[0]) < .9 && p.y > level.flag[1] && p.y < level.flag[1] + 2 && Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < 1){ won = true; wonAt = t; ev.push(['win']); }
    if (fellAt < 0 && p.y < low - 2.5){ fellAt = t; ev.push(['fall']); }
    if (p.x > prog.x + .35 || p.y < prog.y - .6) prog = { x: Math.max(p.x, prog.x), y: Math.min(p.y, prog.y), t };
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
    let roll = 0; for (const o of wheels){ let touching = false; for (let ce = o.w.getContactList(); ce; ce = ce.next) if (ce.contact.isTouching()) touching = true; if (touching) roll += Math.abs(o.w.getAngularVelocity()) / 2; }
    return { t, car: P(car), cabin: P(cabin), wheels: wheels.map(o => P(o.w)), hp, fire, exploded, won, ended, roll, rpm: wheels.reduce((a, o) => a + (o.on ? Math.abs(o.w.getAngularVelocity()) : 0), 0) / 2,
      ink: inks.map(P), blocks: blocks.map(o => o.broken ? P(o.body) : null), debris: debris.filter(d => !d.gone).map(d => [...P(d.b), d.k, d.s, d.h || 0]),
      hazards: hz.map(o => o.h.type === 'spinner' ? { spin: o.b.getAngle(), bullets: o.bullets.map(q => [...P(q.b), t - q.t0]) } : o.h.type === 'saw' ? { pos: P(o.b) } : { t }) };
  }
  return { step, state, strokes, get t(){ return t; } };
}
export function inkLength(strokes){ let L = 0; for (const s of strokes) for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; }
