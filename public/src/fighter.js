// One fighter: movement, moves, footsteps, ribbons and hit checks.
import { GROUND, SC, PI, L, STAGE, MIN_GAP, WALK_FWD, WALK_BACK, ACCEL, time, clamp } from "./config.js";
import { STANCE, FOOT, UPPER, MOVES, sampleMove, solve } from "./rig.js";

export function makeFighter(id, x, pal, sign) {
  const f = {
    id, x, vx: 0, sign, pal, home: x, phase: Math.random() * 6,
    move: null, mt: 0, from: null, hitDone: false, queued: false, stillT: 0, idleT: 0,
    pose: Object.assign({}, UPPER), sol: null, hx: x, hy: GROUND - SC * STANCE.hipH,
    feet: [{ x: x + sign * SC * STANCE.front, step: null }, { x: x + sign * SC * STANCE.back, step: null }],
    rib: [{ n: 7, seg: 6, pts: null }, { n: 6, seg: 5.2, pts: null }],
    trail: [],
  };
  finishFighter(f, 0);
  return f;
}

export const toWorld = (f, pt) => [f.hx + f.sign * SC * pt[0], f.hy + SC * pt[1]];

export function startMove(f, name) {
  f.from = Object.assign({}, f.pose);
  f.move = MOVES[name]; f.mt = 0; f.hitDone = false; f.queued = false;
}

/** Phase 1: actions and movement. intent = { dir: -1|0|1 (world), speed, punch }. */
export function updateFighter(f, opp, dt, intent) {
  const ns = opp.x >= f.x ? 1 : -1;
  if (ns !== f.sign) { f.sign = ns; f.feet.reverse(); }

  if (intent.punch) {
    if (!f.move || (f.move.name === "punch" && f.mt >= f.move.cancel)) startMove(f, "punch");
    else if (f.move.name === "punch") f.queued = true;
  }
  if (f.move) {
    f.mt += dt;
    if (f.mt >= f.move.len) {
      const again = f.queued;
      f.move = null;
      if (again) startMove(f, "punch");
    }
  }

  if (f.move && f.move.name === "hit") f.vx *= Math.exp(-8 * dt); // knockback slide
  else {
    const target = f.move ? 0 : intent.dir * (intent.dir === f.sign ? WALK_FWD : WALK_BACK) * intent.speed;
    const dv = target - f.vx, maxDv = ACCEL * dt * (f.move ? 2 : 1);
    f.vx += clamp(dv, -maxDv, maxDv);
  }
  f.x = clamp(f.x + f.vx * dt, STAGE.left, STAGE.right);
  f.idleT = f.move || intent.dir ? 0 : f.idleT + dt;
}

/** Keeps the two fighters from walking through each other. */
export function resolveSpacing(a, b) {
  const d = b.x - a.x, gap = Math.abs(d);
  if (gap >= MIN_GAP) return;
  const s = d >= 0 ? 1 : -1, push = (MIN_GAP - gap) / 2;
  a.x -= s * push; b.x += s * push;
  for (const [f, g] of [[a, b], [b, a]]) {
    if (f.x < STAGE.left) { g.x += STAGE.left - f.x; f.x = STAGE.left; }
    if (f.x > STAGE.right) { g.x -= f.x - STAGE.right; f.x = STAGE.right; }
  }
}

/** Phase 2: pose, footsteps, skeleton, ribbons and fist trail. dt = 0 only places things. */
export function finishFighter(f, dt) {
  const p = f.move ? sampleMove(f.move, f.mt, f.from) : Object.assign({}, UPPER);
  const fwd = clamp((f.vx * f.sign) / WALK_FWD, -1, 1);
  if (!f.move) p.lean += fwd * 0.06;
  const br = Math.sin(time.wt * 2.6 + f.phase);
  p.lean += br * 0.015; p.aFs += br * 0.03; p.aBs += br * 0.03; p.hipDy += br * 0.7;
  f.pose = p;

  // --- footsteps: a foot steps when it is too far from where it should rest ---
  const moving = Math.abs(f.vx) > 8;
  f.stillT = moving ? 0 : f.stillT + dt;
  const rest = [f.x + f.sign * SC * (STANCE.front + p.reachF), f.x + f.sign * SC * STANCE.back];
  let lift = [0, 0], bob = 0;
  for (let i = 0; i < 2; i++) {
    const ft = f.feet[i], st = ft.step;
    if (!st) continue;
    st.u = Math.min(1, st.u + dt / st.dur);
    const e = st.u * st.u * (3 - 2 * st.u);
    ft.x = st.from + (st.to - st.from) * e;
    lift[i] = Math.sin(PI * st.u);
    bob = Math.max(bob, lift[i]);
    if (st.u >= 1) ft.step = null;
  }
  if (dt > 0) {
    const stepping = f.feet.some((ft) => ft.step);
    const thr = f.move && f.move.name === "punch" ? 6 : moving ? 14 : f.stillT > 0.05 ? 3 : Infinity;
    const dur = f.move ? f.move.stepDur : moving ? clamp(0.17 - Math.abs(f.vx) * 0.0002, 0.1, 0.17) : 0.14;
    const errs = f.feet.map((ft, i) => rest[i] - ft.x);
    const begin = (i) => {
      const lead = moving ? f.vx * dur * 0.9 : 0;
      f.feet[i].step = { from: f.feet[i].x, to: rest[i] + lead, u: 0, dur };
    };
    if (!stepping) {
      const i = Math.abs(errs[0]) >= Math.abs(errs[1]) ? 0 : 1;
      if (Math.abs(errs[i]) > thr) begin(i);
    }
    for (let i = 0; i < 2; i++) if (!f.feet[i].step && Math.abs(errs[i]) > 46) begin(i); // can't reach: hop it
  }

  f.hx = f.x + f.sign * SC * p.hipDx;
  f.hy = GROUND - SC * (STANCE.hipH - p.hipDy + bob * 1.8);
  const target = (i, h) => [(f.feet[i].x - f.hx) * f.sign / SC, (GROUND - SC * (h + lift[i] * 8) - f.hy) / SC];
  f.sol = solve(p, target(0, FOOT.frontH), target(1, FOOT.backH), FOOT.frontAng - lift[0] * 0.4, FOOT.backAng - lift[1] * 0.1);

  if (dt > 0) {
    f.rib.forEach((r, i) => updateRibbon(f, r, i, dt));
    const w = toWorld(f, f.sol.aF.wr);
    f.trail.push({ x: w[0], y: w[1], t: time.gt });
    while (f.trail.length && time.gt - f.trail[0].t > 0.1) f.trail.shift();
  } else f.rib.forEach((r, i) => { if (!r.pts) updateRibbon(f, r, i, 1 / 60); });
}

function updateRibbon(f, r, i, dt) {
  const s = f.sol, a = toWorld(f, [s.head[0] - L.headR * 0.9, s.head[1] - 6 - i * 1.5]);
  if (!r.pts) {
    r.pts = [];
    for (let j = 0; j < r.n; j++) { const x = a[0] - f.sign * j * r.seg * SC, y = a[1] + j * 2; r.pts.push({ x, y, px: x, py: y }); }
  }
  const pts = r.pts, wt = time.wt;
  Object.assign(pts[0], { x: a[0], y: a[1], px: a[0], py: a[1] });
  const dt2 = dt * dt;
  for (let j = 1; j < r.n; j++) {
    const q = pts[j], vx = (q.x - q.px) * 0.94, vy = (q.y - q.py) * 0.94;
    q.px = q.x; q.py = q.y;
    q.x += vx - f.sign * (420 + 180 * Math.sin(wt * 3.1 + j * 0.7 + i)) * dt2;
    q.y += vy + (380 + 120 * Math.sin(wt * 4.3 + j)) * dt2;
  }
  const seg = r.seg * SC;
  for (let it = 0; it < 4; it++) {
    for (let j = 1; j < r.n; j++) {
      const p = pts[j - 1], q = pts[j], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1e-6, diff = (d - seg) / d;
      if (j === 1) { q.x -= dx * diff; q.y -= dy * diff; }
      else { p.x += dx * diff * 0.5; p.y += dy * diff * 0.5; q.x -= dx * diff * 0.5; q.y -= dy * diff * 0.5; }
    }
  }
}

/** The body capsule that can be hit: hip to head, in world px. */
export function bodyCapsule(f) {
  return { a: toWorld(f, f.sol.hip), b: toWorld(f, f.sol.head), r: SC * 17 };
}

function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const u = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p[0] - a[0] - dx * u, p[1] - a[1] - dy * u);
}

/** Returns the contact point if att's strike lands on def this update. */
export function checkHit(att, def) {
  const m = att.move;
  if (!m || !m.active || att.hitDone || att.mt < m.active[0] || att.mt > m.active[1]) return null;
  const pt = toWorld(att, m.limb === "fist" ? att.sol.aF.wr : att.sol.lF.toe);
  const c = bodyCapsule(def);
  if (distToSeg(pt, c.a, c.b) > c.r + SC * 4.6) return null;
  att.hitDone = true;
  return { x: pt[0], y: pt[1], pow: m.pow };
}
