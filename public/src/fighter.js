// One fighter: actions, movement, jumping, footsteps, ribbons, health, guard and hits.
import { GROUND, SC, PI, L, STAGE, MIN_GAP, WALK_FWD, WALK_BACK, ACCEL, time, clamp } from "./config.js";
import { STANCE, FOOT, BASE, MOVES, P, sampleMove, lerpPose, solve, lowestY } from "./rig.js";

export const MAX_HP = 100, MAX_GUARD = 100;
const GRAVITY = 2200, JUMP_V = 720, JUMP_VX = 210;
const BLEND = 0.1;             // s to blend out of a finished move
const BUFFER = 0.32;           // s a button press waits for the fighter to be free
const COMBO_GAP = 0.3;         // s after a punch ends in which the next punch still chains
const ROLL_COOLDOWN = 1.0;
const GUARD_COST = 3, CHIP = 0.2, GUARD_REGEN = 30, GUARD_REGEN_DELAY = 0.6, GUARD_MIN = 25;
/** Moves in which the fighter slides from a hit instead of walking. */
const KNOCKBACK = new Set(["hitHigh", "hitGut", "blockHit", "stagger", "knockdown", "ko"]);

const STAND = P("guard"), CROUCH = P("crouch"), BLOCK = P("block"), JUMP_TUCK = P("jumpTuck"), JUMP_STRETCH = P("jumpStretch");

export function makeFighter(id, x, pal, sign) {
  const f = { id, pal, home: x, phase: Math.random() * 6 };
  resetFighter(f, x, sign);
  return f;
}

export function resetFighter(f, x, sign) {
  Object.assign(f, {
    x, y: 0, vx: 0, vy: 0, air: false, sign, hp: MAX_HP, guard: MAX_GUARD, lastBlockT: -9, blocking: false,
    move: null, mt: 0, from: null, hitDone: false, dived: false, buf: null, last: null, rollReady: 0, slideSign: sign, trailLimb: "", jumpDir: 0,
    airAtk: false, cw: 0, bw: 0, blendFrom: null, blendT: 0, stillT: 0, idleT: 0,
    pose: Object.assign({}, BASE), sol: null, hx: x, hy: GROUND - SC * STANCE.hipH,
    feet: [{ x: x + sign * SC * STANCE.front, step: null }, { x: x + sign * SC * STANCE.back, step: null }],
    rib: [{ n: 7, seg: 6, pts: null }, { n: 6, seg: 5.2, pts: null }],
    trail: [],
  });
  finishFighter(f, 0);
}

export const toWorld = (f, pt) => [f.hx + f.sign * SC * pt[0], f.hy + SC * pt[1]];

function wrapRot(p) {
  const o = Object.assign({}, p);
  o.rot = Math.atan2(Math.sin(o.rot), Math.cos(o.rot));
  return o;
}

export function startMove(f, name) {
  f.from = wrapRot(f.pose);
  f.move = MOVES[name]; f.mt = 0; f.hitDone = false; f.dived = false; f.blendT = 0; f.slideSign = f.sign;
}

function endMove(f) {
  const m = f.move;
  f.blendFrom = wrapRot(f.pose); f.blendT = BLEND;
  f.move = null; f.last = { name: m.name, t: time.gt };
  if (m.launch) { f.air = true; f.vy = JUMP_V; f.vx = f.jumpDir * JUMP_VX; }
}

const isInvulnerable = (f) => f.move && f.move.inv && f.mt >= f.move.inv[0] && f.mt <= f.move.inv[1];

/**
 * Phase 1: actions and movement.
 * intent = { dir: -1|0|1 (world), speed, crouch, block (held), punch, kick, heavy, jump, roll (pressed this update) }.
 */
export function updateFighter(f, opp, dt, it) {
  if (!f.air && !f.move) {
    const ns = opp.x >= f.x ? 1 : -1;
    if (ns !== f.sign) { f.sign = ns; f.feet.reverse(); }
  }
  for (const a of ["punch", "kick", "heavy", "jump", "roll"]) if (it[a]) f.buf = { a, t: time.gt };
  const want = f.hp > 0 && f.buf && time.gt - f.buf.t < BUFFER ? f.buf.a : null;

  if (f.move) {
    const m = f.move;
    f.mt += dt;
    if (m.slide) f.vx = f.mt < m.slide.until ? m.slide.v * f.slideSign : f.vx * Math.exp(-12 * dt);
    if (m.dive && !f.dived && f.mt >= m.dive) { f.dived = true; f.vy = -950; }
    if (!m.hold && f.mt >= m.len) endMove(f);
  }

  // --- start a new action ---
  const m = f.move;
  if (want) {
    let next = null;
    if (f.air) {
      if (!m && !f.airAtk && want === "punch") next = "smash";
      else if (!m && !f.airAtk && (want === "kick" || want === "heavy")) next = "fly";
      if (next) f.airAtk = true;
    } else if (!m || (m.atk && !m.air && f.mt >= m.cancel)) {
      if (want === "roll" && time.gt >= f.rollReady) next = it.dir === f.sign ? "rollF" : "rollB";
      else if (want === "jump" && !m) next = "squat";
      else if ((want === "punch" || want === "kick") && it.crouch) next = "low";
      else if (want === "punch") {
        const lastChain = f.last && time.gt - f.last.t < COMBO_GAP && MOVES[f.last.name].chain;
        next = m ? m.chain || "jab" : lastChain || "jab";
      } else if (want === "kick") next = "kick";
      else if (want === "heavy") next = "heavy";
    }
    if (next) {
      f.buf = null;
      startMove(f, next);
      if (next.startsWith("roll")) f.rollReady = time.gt + ROLL_COOLDOWN;
      if (next === "squat") f.jumpDir = it.dir;
    }
  }

  // --- held stances ---
  const free = !f.air && !f.move && f.hp > 0;
  const blocking = free && it.block && (f.guard >= GUARD_MIN || f.bw > 0.5);
  const crouching = free && it.crouch && !blocking;
  f.blocking = blocking || (f.move && f.move.name === "blockHit");
  const toward = (v, target, rate) => v + clamp(target - v, -rate * dt, rate * dt);
  f.cw = toward(f.cw, it.crouch && !blocking && !f.air && f.hp > 0 ? 1 : 0, 12);
  f.bw = toward(f.bw, blocking ? 1 : 0, 16);
  if (!f.blocking && time.gt - f.lastBlockT > GUARD_REGEN_DELAY) f.guard = Math.min(MAX_GUARD, f.guard + GUARD_REGEN * dt);

  // --- horizontal movement ---
  const mv = f.move;
  if (f.air) { /* keep momentum */ }
  else if (mv && mv.slide) { /* set above */ }
  else if (mv && KNOCKBACK.has(mv.name)) f.vx *= Math.exp(-8 * dt);
  else {
    const walk = free && !blocking && !crouching ? it.dir * (it.dir === f.sign ? WALK_FWD : WALK_BACK) * it.speed : 0;
    f.vx = toward(f.vx, walk, mv ? ACCEL * 2 : ACCEL);
  }
  f.x = clamp(f.x + f.vx * dt, STAGE.left, STAGE.right);

  // --- vertical ---
  if (f.air) {
    f.vy -= GRAVITY * dt;
    f.y += f.vy * dt;
    if (f.y <= 0) {
      f.y = 0; f.vy = 0; f.air = false; f.airAtk = false;
      if (!f.move || f.move.air) { if (f.move) f.move = null; startMove(f, "land"); f.vx *= 0.3; }
    }
  }
  f.idleT = f.move || it.dir || f.air ? 0 : f.idleT + dt;
}

/** Keeps the two fighters from walking through each other (but lets rolls and jumps pass). */
export function resolveSpacing(a, b) {
  const passing = (f) => f.y > 30 || (f.move && f.move.pass);
  if (passing(a) || passing(b)) return;
  const d = b.x - a.x, gap = Math.abs(d);
  if (gap >= MIN_GAP) return;
  const s = d >= 0 ? 1 : -1, push = Math.min(10, (MIN_GAP - gap) / 2);
  a.x -= s * push; b.x += s * push;
  for (const [f, g] of [[a, b], [b, a]]) {
    if (f.x < STAGE.left) { g.x += STAGE.left - f.x; f.x = STAGE.left; }
    if (f.x > STAGE.right) { g.x -= f.x - STAGE.right; f.x = STAGE.right; }
  }
}

/** Phase 2: pose, footsteps, skeleton, ribbons and strike trail. dt = 0 only places things. */
export function finishFighter(f, dt) {
  let stance = lerpPose(lerpPose(STAND, CROUCH, f.cw), BLOCK, f.bw);
  if (f.air && !f.move) stance = lerpPose(JUMP_STRETCH, JUMP_TUCK, clamp(1 - Math.abs(f.vy) / 650, 0, 1));
  let p = f.move ? sampleMove(f.move, f.mt, f.from) : stance;
  if (f.blendT > 0) {
    f.blendT = Math.max(0, f.blendT - dt);
    const u = 1 - f.blendT / BLEND;
    p = lerpPose(f.blendFrom, p, u * u * (3 - 2 * u));
  }
  if (!f.move && !f.air) p.lean += clamp((f.vx * f.sign) / WALK_FWD, -1, 1) * 0.06;
  if (f.hp > 0) {
    const br = Math.sin(time.wt * 2.6 + f.phase) * (1 - p.gs);
    p.lean += br * 0.015; p.aFs += br * 0.03; p.aBs += br * 0.03; p.hipDy += br * 0.7 * p.ikF;
  }
  f.pose = p;

  // --- footsteps: a planted foot steps when it is too far from where it should rest ---
  const grounded = !f.air;
  const moving = grounded && Math.abs(f.vx) > 8;
  f.stillT = moving ? 0 : f.stillT + dt;
  const rest = [f.x + f.sign * SC * (STANCE.front + p.reachF), f.x + f.sign * SC * (STANCE.back + p.reachB)];
  const ik = [p.ikF, p.ikB], lift = [0, 0];
  let bob = 0;
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
  if (dt > 0 && grounded) {
    const planted = (i) => ik[i] >= 0.5;
    const stepping = f.feet.some((ft) => ft.step);
    const thr = f.move && f.move.atk ? 6 : moving ? 14 : f.stillT > 0.05 ? 3 : Infinity;
    const dur = f.move ? f.move.stepDur : moving ? clamp(0.17 - Math.abs(f.vx) * 0.0002, 0.1, 0.17) : 0.14;
    const errs = f.feet.map((ft, i) => rest[i] - ft.x);
    const begin = (i) => {
      const lead = moving ? f.vx * dur * 0.9 : 0;
      f.feet[i].step = { from: f.feet[i].x, to: rest[i] + lead, u: 0, dur };
    };
    if (!stepping) {
      const i = Math.abs(errs[0]) >= Math.abs(errs[1]) ? 0 : 1;
      if (planted(i) && Math.abs(errs[i]) > thr) begin(i);
    }
    for (let i = 0; i < 2; i++) if (planted(i) && !f.feet[i].step && Math.abs(errs[i]) > 46) begin(i);
  }

  // --- skeleton ---
  f.hx = f.x;
  let hy = GROUND - SC * (STANCE.hipH - p.hipDy + bob * 1.8) - f.y;
  const solveAt = (hy) => {
    const tgt = (i, h) => [(f.feet[i].x - f.hx) * f.sign / SC, (GROUND - SC * (h + lift[i] * 8) - hy) / SC];
    return solve(p, tgt(0, FOOT.frontH), tgt(1, FOOT.backH), FOOT.frontAng - lift[0] * 0.4, FOOT.backAng - lift[1] * 0.1, (GROUND - hy) / SC);
  };
  let s = solveAt(hy);
  if (p.gs > 0.001) {
    const snap = GROUND - SC * lowestY(s) - f.y;
    hy += (snap - hy) * p.gs;
    s = solveAt(hy);
  }
  f.hy = hy; f.sol = s;
  // Feet that aren't planted follow the leg, so they land where the leg puts them.
  const ank = [s.lF.an, s.lB.an];
  for (let i = 0; i < 2; i++) if (ik[i] < 0.5 || f.air) { f.feet[i].x = toWorld(f, ank[i])[0]; f.feet[i].step = null; }

  if (dt > 0) {
    f.rib.forEach((r, i) => updateRibbon(f, r, i, dt));
    const limb = f.move && f.move.limb ? f.move.limb : "";
    if (limb !== f.trailLimb) { f.trail.length = 0; f.trailLimb = limb; }
    if (limb) { const w = toWorld(f, LIMB[limb](s)); f.trail.push({ x: w[0], y: w[1], t: time.gt }); }
    while (f.trail.length && time.gt - f.trail[0].t > 0.1) f.trail.shift();
  } else f.rib.forEach((r, i) => { if (!r.pts) updateRibbon(f, r, i, 1 / 60); });
}

function updateRibbon(f, r, i, dt) {
  const s = f.sol, c = Math.cos(s.headRot), sn = Math.sin(s.headRot);
  const ox = -L.headR * 0.9, oy = -6 - i * 1.5;
  const a = toWorld(f, [s.head[0] + ox * c - oy * sn, s.head[1] + ox * sn + oy * c]);
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
    if (q.y > GROUND + 2) q.y = GROUND + 2;
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

// ---------- hits ----------
export const LIMB = { fistF: (s) => s.aF.wr, fistB: (s) => s.aB.wr, toeF: (s) => s.lF.toe, toeB: (s) => s.lB.toe };

/** The parts of the body that can be hit (arms can't), in world px. */
export function hurtShapes(f) {
  const s = f.sol, w = (p) => toWorld(f, p);
  return [
    { a: w(s.hip), b: w(s.neck), r: SC * 14, part: "body" },
    { a: w(s.head), b: w(s.head), r: SC * 12, part: "head" },
    { a: w(s.hip), b: w(s.lF.knee), r: SC * 7, part: "legs" }, { a: w(s.lF.knee), b: w(s.lF.an), r: SC * 6, part: "legs" },
    { a: w(s.hip), b: w(s.lB.knee), r: SC * 7, part: "legs" }, { a: w(s.lB.knee), b: w(s.lB.an), r: SC * 6, part: "legs" },
    { a: w(s.lF.an), b: w(s.lF.toe), r: SC * 4, part: "legs" }, { a: w(s.lB.an), b: w(s.lB.toe), r: SC * 4, part: "legs" },
  ];
}
export const strikeRadius = (limb) => SC * (limb.startsWith("fist") ? 4.6 : 5);

function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const u = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p[0] - a[0] - dx * u, p[1] - a[1] - dy * u);
}

/**
 * Returns the contact if att's strike touches def this update. The whole path the fist or foot moved
 * along since the last update is tested, so fast strikes can't pass through a limb between frames.
 */
export function checkHit(att, def) {
  const m = att.move;
  const pt = m && m.limb ? toWorld(att, LIMB[m.limb](att.sol)) : null;
  const prev = att.prevStrike;
  att.prevStrike = pt ? { m, x: pt[0], y: pt[1] } : null;
  if (!m || !m.active || att.hitDone || att.mt < m.active[0] || att.mt > m.active[1]) return null;
  if (def.hp <= 0 || isInvulnerable(def)) return null;
  const from = prev && prev.m === m ? [prev.x, prev.y] : pt, rr = strikeRadius(m.limb);
  const shapes = hurtShapes(def);
  for (let i = 1; i <= 4; i++) {
    const u = i / 4, q = [from[0] + (pt[0] - from[0]) * u, from[1] + (pt[1] - from[1]) * u];
    for (const h of shapes) {
      if (distToSeg(q, h.a, h.b) <= h.r + rr) { att.hitDone = true; return { x: q[0], y: q[1], part: h.part, m }; }
    }
  }
  return null;
}

/** Applies a landed strike. Returns what happened: hit, block, break (guard broken), kd (knocked down) or ko. */
export function applyHit(def, att, hit) {
  const m = hit.m, dir = att.sign;
  const ko = () => { startMove(def, "ko"); def.hp = 0; def.vx = dir * 380; def.air = true; def.vy = Math.max(def.vy, 320); return { kind: "ko", pow: 2.2 }; };
  const facing = def.sign === -att.sign;
  if (def.blocking && !m.low && facing && !def.air) {
    def.lastBlockT = time.gt;
    def.guard -= m.dmg * GUARD_COST;
    def.hp = Math.max(0, def.hp - Math.ceil(m.dmg * CHIP));
    if (def.hp <= 0) return ko();
    if (def.guard <= 0) { def.guard = 0; startMove(def, "stagger"); def.vx = dir * 170; return { kind: "break", pow: 1.6 }; }
    startMove(def, "blockHit"); def.vx = dir * m.push * 0.55;
    return { kind: "block", pow: m.pow * 0.8 };
  }
  def.hp = Math.max(0, def.hp - m.dmg);
  if (def.hp <= 0) return ko();
  if (m.kd || def.air) {
    startMove(def, "knockdown"); def.vx = dir * 330;
    if (!def.air) { def.air = true; def.vy = 260; }
    return { kind: "kd", pow: m.pow };
  }
  startMove(def, hit.part === "head" ? "hitHigh" : "hitGut"); def.vx = dir * m.push;
  return { kind: "hit", pow: m.pow };
}
