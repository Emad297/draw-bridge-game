// Deterministic physics for one run (planck.js / Box2D). Same level + same strokes => same result,
// which is what lets a liked run be replayed exactly when the video is made.
const pl = window.planck;
export const DT = 1 / 60;

export function createSim(level, strokes){
  const { World, Vec2, Box, Circle, Polygon, WheelJoint } = pl;
  const world = new World({ gravity: Vec2(0, -10) });
  const ground = world.createBody();
  for (const [x0, x1, top] of level.solids) ground.createFixture(Box((x1 - x0) / 2, 25, Vec2((x0 + x1) / 2, top - 25), 0), { friction: .9 });

  // ---- the drawing: one rigid body with weight
  const ink = world.createBody({ type: 'dynamic', position: Vec2(0, 0) });
  let inkMass = 0;
  for (const s of strokes){
    if (s.length === 1 || (s.length === 2 && Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) < .05)){ ink.createFixture(Circle(Vec2(s[0][0], s[0][1]), .09), { density: 1.2, friction: .8 }); inkMass++; continue; }
    for (let i = 1; i < s.length; i++){ const [x0, y0] = s[i - 1], [x1, y1] = s[i], L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-3) continue;
      ink.createFixture(Box(L / 2 + .04, .07, Vec2((x0 + x1) / 2, (y0 + y1) / 2), Math.atan2(y1 - y0, x1 - x0)), { density: 1.2, friction: .9 }); inkMass++; } }
  if (!inkMass) ink.setType('static');

  // ---- the car
  const [cx, cy] = level.car;
  const car = world.createBody({ type: 'dynamic', position: Vec2(cx, cy) });
  car.createFixture(Box(.85, .22, Vec2(0, -.05), 0), { density: 2.2, friction: .4 });
  car.createFixture(Box(.45, .16, Vec2(-.1, .34), 0), { density: .5 });
  const wheels = [-.55, .55].map(x => { const w = world.createBody({ type: 'dynamic', position: Vec2(cx + x, cy - .37) }); w.createFixture(Circle(.3), { density: 1.2, friction: 1.4 });
    const j = world.createJoint(WheelJoint({ motorSpeed: 0, maxMotorTorque: 9, enableMotor: true, frequencyHz: 4, dampingRatio: .7 }, car, w, w.getPosition(), Vec2(0, 1))); return { w, j }; });

  // ---- hazards
  const hz = (level.hazards || []).map(h => {
    if (h.type === 'spinner'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.x, h.y) }); b.setAngularVelocity(-h.spin); b.createFixture(Circle(.55), { friction: .3 });
      for (let k = 0; k < h.arms; k++){ const a = k / h.arms * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); b.createFixture(Box(h.len / 2, .14, Vec2(c * h.len / 2, s * h.len / 2), a), { friction: .3, restitution: .4 });
        b.createFixture(Polygon([Vec2(c * h.len - s * .3, s * h.len + c * .3), Vec2(c * (h.len + .55), s * (h.len + .55)), Vec2(c * h.len + s * .3, s * h.len - c * .3)]), { restitution: .6 }); }
      return { h, b, bullets: [], next: h.shots ? h.shots.first : 1e9 }; }
    if (h.type === 'saw'){ const b = world.createBody({ type: 'kinematic', position: Vec2(h.path[0][0], h.path[0][1]) }); b.setAngularVelocity(-h.spin);
      b.createFixture(Circle(h.r * .82), { friction: .2, restitution: .5 }); for (let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2, a2 = a + .3; b.createFixture(Polygon([Vec2(Math.cos(a) * h.r * .8, Math.sin(a) * h.r * .8), Vec2(Math.cos(a + .18) * h.r * 1.12, Math.sin(a + .18) * h.r * 1.12), Vec2(Math.cos(a2) * h.r * .8, Math.sin(a2) * h.r * .8)]), { restitution: .5 }); }
      return { h, b }; }
    if (h.type === 'fan') return { h };
    return { h }; });

  let t = 0, won = false, wonAt = -1, fellAt = -1, stuckFor = 0, prevV = null, ended = null;
  const bodies = () => [car, ...wheels.map(o => o.w), ink];
  function step(){
    const ev = [];
    const go = t >= .4; wheels.forEach(({ j }) => j.setMotorSpeed(go && !won ? -level.speed : won ? 0 : 0));
    for (const o of hz){ const h = o.h;
      if (h.type === 'spinner' && h.shots && t >= o.next){ const k = o.bullets.length, ang = h.shots.angles[k % h.shots.angles.length];
        const b = world.createBody({ type: 'dynamic', bullet: true, position: Vec2(h.x + Math.sin(ang) * .7, h.y + Math.cos(ang) * .7), angle: -ang });
        b.createFixture(Polygon([Vec2(-.09, -.28), Vec2(.09, -.28), Vec2(0, .34)]), { density: 4, restitution: .3 }); b.setLinearVelocity(Vec2(Math.sin(ang) * h.shots.speed, Math.cos(ang) * h.shots.speed));
        o.bullets.push({ b, t0: t }); o.next += h.shots.every; ev.push(['shot']); }
      if (h.type === 'saw'){ const w = 2 * Math.PI / h.period, u = .5 - .5 * Math.cos(w * t), du = .5 * w * Math.sin(w * t), [p0, p1] = h.path; o.b.setLinearVelocity(Vec2((p1[0] - p0[0]) * du, (p1[1] - p0[1]) * du)); }
      if (h.type === 'fan'){ const [dx, dy] = h.dir; for (const b of bodies()){ const p = b.getPosition(), rx = p.x - h.x, ry = p.y - h.y, along = rx * dx + ry * dy, side = Math.abs(rx * -dy + ry * dx);
          if (along > 0 && along < h.length && side < h.width / 2){ const f = h.power * b.getMass() * (1 - along / h.length * .6); b.applyForceToCenter(Vec2(dx * f, dy * f), true); } } } }
    world.step(DT, 8, 3); t += DT;
    const p = car.getPosition(), v = car.getLinearVelocity(), ang = car.getAngle();
    if (prevV){ const dv = Math.hypot(v.x - prevV.x, v.y - prevV.y); if (dv > 4.5) ev.push(['crash', Math.min(1, dv / 14)]); } prevV = { x: v.x, y: v.y };
    if (!won && Math.abs(p.x - level.flag[0]) < .9 && p.y > level.flag[1] && p.y < level.flag[1] + 2 && Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < 1){ won = true; wonAt = t; ev.push(['win']); }
    if (won) wheels.forEach(({ j }) => j.setMotorSpeed(0));
    const low = Math.min(...level.solids.map(s => s[2]));
    if (fellAt < 0 && p.y < low - 2.5){ fellAt = t; ev.push(['fall']); }
    if (t > 1.5 && Math.hypot(v.x, v.y) < .08) stuckFor += DT; else stuckFor = 0;
    if (!ended){ if (won && t - wonAt > 2.2) ended = 'win'; else if (fellAt > 0 && t - fellAt > 1.6) ended = 'fell'; else if (stuckFor > 2.0) ended = 'stuck'; else if (t > 14) ended = 'timeout'; if (ended) ev.push(['end', ended]); }
    return ev;
  }
  function state(){
    const P = b => { const p = b.getPosition(); return [p.x, p.y, b.getAngle()]; };
    return { t, car: P(car), wheels: wheels.map(o => P(o.w)), ink: P(ink), won, ended,
      hazards: hz.map(o => o.h.type === 'spinner' ? { spin: o.b.getAngle(), bullets: o.bullets.map(q => [...P(q.b), t - q.t0]) } : o.h.type === 'saw' ? { pos: P(o.b) } : { t }) };
  }
  return { step, state, get t(){ return t; } };
}
export function inkLength(strokes){ let L = 0; for (const s of strokes) for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; }
