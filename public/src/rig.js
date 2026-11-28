// Poses, moves and the skeleton maths.
// Local coords: facing right (+x toward the opponent), y down, origin at the hip's stance spot, in skeleton units.
// Angles: 0 = straight down, + = rotated toward the opponent.
import { L, PI, clamp } from "./config.js";

/** Stance: hip height above the ground and where each ankle rests relative to the hip. */
export const STANCE = { hipH: 70, front: 14, back: -36 };
/** Front foot is flat; back foot is up on the ball of the foot (heel raised). */
export const FOOT = { frontAng: 1.48, frontH: 3.7, backAng: 0.95, backH: 10 };

/**
 * Every pose has all of these numbers, so any two poses blend.
 * lFh/lFk, lBh/lBk: keyframed leg angles (hip, knee bend), used where ikF/ikB is 0.
 * ikF/ikB: 1 = that foot is planted and the leg bends to reach it; 0 = the keyframed angles.
 * hipDx: hip forward; hipDy: hip lower; reachF/reachB: where each foot likes to rest (forward +).
 * rot: whole-body rotation (+ = pitch forward); gs: 1 = drop the body until its lowest point touches the ground.
 */
export const BASE = {
  lean: 0.12, tilt: 0, aFs: 0.75, aFe: 1.85, aBs: 0.45, aBe: 2.1,
  lFh: 0.38, lFk: 0.42, lBh: -0.38, lBk: 0.3, ikF: 1, ikB: 1,
  hipDx: 0, hipDy: 0, reachF: 0, reachB: 0, rot: 0, gs: 0,
};
const CROUCH = { lean: 0.42, tilt: -0.25, hipDy: 39, reachF: 4, reachB: -4, aFs: 0.95, aFe: 1.95, aBs: 0.6, aBe: 2.2 };
const TUCK = { lFh: 1.5, lFk: 2.5, lBh: 1.2, lBk: 2.5, ikF: 0, ikB: 0, aFs: 1.6, aFe: 1.6, aBs: 1.4, aBe: 1.8, gs: 1 };
export const POSES = {
  guard: {},
  crouch: CROUCH,
  block: { lean: -0.05, aFs: 1.05, aFe: 2.45, aBs: 0.95, aBe: 2.5, hipDy: 4 },
  blockHit: { lean: -0.16, tilt: -0.1, aFs: 1.0, aFe: 2.5, aBs: 0.9, aBe: 2.55, hipDy: 6, hipDx: -4 },
  // punches
  jabWind: { lean: 0.04, aFs: 0.5, aFe: 2.25, aBs: 0.6, aBe: 1.9, hipDx: -2, reachF: 10 },
  jab: { lean: 0.34, aFs: 1.52, aFe: 0.04, aBs: -0.25, aBe: 2.3, hipDx: 9, hipDy: 4, reachF: 10 },
  crossWind: { lean: 0.02, aFs: 0.95, aFe: 2.1, aBs: 0.25, aBe: 2.35, hipDx: -2, reachF: 8 },
  cross: { lean: 0.45, aFs: 0.45, aFe: 2.2, aBs: 1.55, aBe: 0.04, hipDx: 11, hipDy: 5, reachF: 14 },
  upWind: { lean: 0.4, tilt: -0.15, hipDy: 14, aFs: 0.25, aFe: 2.3, aBs: 0.7, aBe: 2.1, reachF: 10 },
  upper: { lean: 0.2, tilt: -0.2, hipDy: -3, hipDx: 14, aFs: 1.95, aFe: 0.85, aBs: 0.4, aBe: 2.2, reachF: 12 },
  // kicks
  kickChamber: { lean: -0.15, aFs: 0.9, aFe: 1.6, aBs: -0.25, aBe: 1.6, lFh: 1.45, lFk: 2.25, ikF: 0, hipDx: -3 },
  kick: { lean: -0.45, tilt: 0.1, aFs: 0.5, aFe: 1.9, aBs: -0.8, aBe: 0.9, lFh: 1.62, lFk: 0.04, ikF: 0, hipDx: 2 },
  heavyChamber: { lean: 0.05, hipDx: 4, hipDy: 6, lBh: 1.2, lBk: 2.3, ikB: 0, aFs: 0.9, aFe: 2.0, aBs: 0.2, aBe: 2.2 },
  heavy: { lean: -0.6, tilt: 0.12, hipDx: 14, lBh: 1.95, lBk: 0.04, ikB: 0, aFs: 0.4, aFe: 1.9, aBs: -0.9, aBe: 0.8, reachF: 6 },
  lowChamber: { ...CROUCH, lFh: 1.1, lFk: 2.4, ikF: 0 },
  low: { ...CROUCH, lean: 0.55, hipDy: 36, hipDx: 10, lFh: 1.3, lFk: 0.05, ikF: 0, aBs: -0.35, aBe: 0.5 },
  // air
  jumpTuck: { lean: 0.15, lFh: 1.3, lFk: 2.3, lBh: 0.5, lBk: 2.1, ikF: 0, ikB: 0, aFs: 1.0, aFe: 1.8, aBs: 0.3, aBe: 2.1 },
  jumpStretch: { lean: 0.08, lFh: 0.5, lFk: 0.5, lBh: -0.3, lBk: 0.45, ikF: 0, ikB: 0, aFs: 0.9, aFe: 1.9, aBs: 0.4, aBe: 2.0 },
  squat: { lean: 0.25, hipDy: 14 },
  land: { lean: 0.28, hipDy: 16, tilt: -0.1 },
  flyKick: { lean: -0.3, lFh: 1.62, lFk: 0.0, lBh: 0.35, lBk: 2.0, aFs: 0.3, aFe: 2.0, aBs: -0.7, aBe: 1.2, ikF: 0, ikB: 0 },
  axeUp: { lean: -0.25, lFh: 2.9, lFk: 0.1, lBh: 0.3, lBk: 1.6, aFs: 1.3, aFe: 1.0, aBs: -0.4, aBe: 1.2, ikF: 0, ikB: 0 },
  axeDown: { lean: 0.35, lFh: 0.85, lFk: 0.05, lBh: 0.6, lBk: 1.8, aFs: 0.4, aFe: 1.6, aBs: 0.2, aBe: 1.6, ikF: 0, ikB: 0 },
  // getting hit
  hitHigh: { lean: -0.38, tilt: -0.35, aFs: 0.3, aFe: 1.4, aBs: 0.1, aBe: 1.2, hipDx: -5, hipDy: 1 },
  hitGut: { lean: 0.6, tilt: 0.3, hipDx: -6, hipDy: 8, aFs: 0.5, aFe: 1.9, aBs: 0.35, aBe: 1.9 },
  hitBig: { lean: -0.72, tilt: -0.4, aFs: -0.3, aFe: 0.9, aBs: 0.9, aBe: 0.6, hipDx: -6 },
  stagger: { lean: -0.2, tilt: -0.3, hipDy: 6, aFs: 0.15, aFe: 0.5, aBs: -0.1, aBe: 0.45 },
  fall: { rot: -1.0, lean: -0.2, lFh: 0.75, lFk: 0.5, lBh: 0.45, lBk: 0.8, ikF: 0, ikB: 0, aFs: 2.2, aFe: 0.4, aBs: 2.6, aBe: 0.3, gs: 0.6 },
  lying: { rot: -1.52, lean: 0, tilt: -0.1, lFh: 0.25, lFk: 0.35, lBh: 0.05, lBk: 0.2, ikF: 0, ikB: 0, aFs: 2.5, aFe: 0.3, aBs: 2.9, aBe: 0.2, gs: 1 },
  sitUp: { rot: -0.5, lean: 0.45, tilt: -0.3, lFh: 1.1, lFk: 2.2, lBh: 0.6, lBk: 2.3, ikF: 0, ikB: 0, aFs: 0.2, aFe: 0.4, aBs: -0.5, aBe: 0.3, gs: 1 },
  kneel: { ...CROUCH, gs: 0.5 },
  // roll
  rollIn: { ...CROUCH, gs: 0.3 },
  tuck: { lean: 0.6, tilt: 0.3, ...TUCK },
  // winning a round: front fist up, back hand on the hip, chin up
  victory: { lean: -0.08, tilt: -0.2, aFs: 2.75, aFe: 0.35, aBs: -0.6, aBe: 1.6, hipDy: -2 },
};

export const P = (name, over) => Object.assign({}, BASE, POSES[name], over);
const k = (t, name, ease = "io", over) => ({ t, ease, p: P(name, over) });

/**
 * A move is a keyframe track over time (s). The first key is replaced by the pose the body was in
 * when the move started, so moves blend out of whatever came before.
 *   atk: an attack; cancel: from here another attack may start; chain: what the punch button does next
 *   active: when the strike can land; limb: which point strikes; dmg, push (px/s), kd (knocks down), low (beats standing block)
 *   slide: move forward at v px/s until a time; pass: can go through the opponent (rolls)
 *   inv: window in which hits pass through; air: an air attack (landing ends it); hold: never ends by itself
 */
const roll = (dir) => ({
  len: 0.56, inv: [0, 0.38], slide: { v: 560 * dir, until: 0.4 }, pass: true, stepDur: 0.1,
  track: [k(0, "guard"), k(0.06, "rollIn"), k(0.14, "tuck", "io", { rot: 0.5 * PI * dir }), k(0.27, "tuck", "io", { rot: 1.5 * PI * dir }),
    k(0.38, "tuck", "io", { rot: 2 * PI * dir }), k(0.47, "rollIn", "io", { rot: 2 * PI * dir }), k(0.56, "guard", "io", { rot: 2 * PI * dir })],
});
export const MOVES = {
  jab: { atk: true, len: 0.36, cancel: 0.2, chain: "cross", active: [0.09, 0.18], limb: "fistF", dmg: 6, push: 150, pow: 1, stepDur: 0.09,
    track: [k(0, "guard"), k(0.05, "jabWind"), k(0.11, "jab", "out"), k(0.2, "jab"), k(0.36, "guard")] },
  cross: { atk: true, len: 0.42, cancel: 0.24, chain: "upper", active: [0.11, 0.21], limb: "fistB", dmg: 8, push: 170, pow: 1.2, stepDur: 0.09,
    track: [k(0, "guard"), k(0.07, "crossWind"), k(0.14, "cross", "out"), k(0.24, "cross"), k(0.42, "guard")] },
  upper: { atk: true, len: 0.56, cancel: 0.45, active: [0.13, 0.27], limb: "fistF", dmg: 12, push: 260, kd: true, pow: 1.7, stepDur: 0.1,
    slide: { v: 380, until: 0.16 },
    track: [k(0, "guard"), k(0.1, "upWind"), k(0.2, "upper", "out"), k(0.32, "upper"), k(0.56, "guard")] },
  kick: { atk: true, len: 0.5, cancel: 0.4, active: [0.14, 0.28], limb: "toeF", dmg: 10, push: 260, pow: 1.3, stepDur: 0.1,
    track: [k(0, "guard"), k(0.1, "kickChamber"), k(0.17, "kick", "out"), k(0.28, "kick"), k(0.38, "kickChamber"), k(0.5, "guard")] },
  heavy: { atk: true, len: 0.74, cancel: 0.66, active: [0.23, 0.4], limb: "toeB", dmg: 20, push: 340, kd: true, pow: 2, stepDur: 0.12,
    track: [k(0, "guard"), k(0.16, "heavyChamber"), k(0.26, "heavy", "out"), k(0.42, "heavy"), k(0.58, "heavyChamber"), k(0.74, "guard")] },
  low: { atk: true, len: 0.46, cancel: 0.4, active: [0.08, 0.27], limb: "toeF", dmg: 8, push: 150, low: true, pow: 1.1, stepDur: 0.1,
    track: [k(0, "crouch"), k(0.08, "lowChamber"), k(0.15, "low", "out"), k(0.27, "low"), k(0.46, "crouch")] },
  fly: { atk: true, air: true, len: 0.5, active: [0.06, 0.5], limb: "toeF", dmg: 14, push: 300, pow: 1.5, stepDur: 0.1,
    track: [k(0, "guard"), k(0.08, "flyKick", "out"), k(0.5, "flyKick")] },
  smash: { atk: true, air: true, len: 0.6, active: [0.17, 0.6], limb: "toeF", dmg: 16, push: 280, kd: true, pow: 1.8, dive: 0.15, stepDur: 0.1,
    track: [k(0, "guard"), k(0.13, "axeUp", "out"), k(0.25, "axeDown"), k(0.6, "axeDown")] },
  squat: { len: 0.07, launch: true, stepDur: 0.1, track: [k(0, "guard"), k(0.07, "squat")] },
  land: { len: 0.17, stepDur: 0.1, track: [k(0, "guard"), k(0.05, "land", "out"), k(0.17, "guard")] },
  rollF: roll(1),
  rollB: roll(-1),
  hitHigh: { len: 0.42, stepDur: 0.1, track: [k(0, "guard"), k(0.05, "hitHigh", "out"), k(0.2, "hitHigh"), k(0.42, "guard")] },
  hitGut: { len: 0.45, stepDur: 0.1, track: [k(0, "guard"), k(0.05, "hitGut", "out"), k(0.22, "hitGut"), k(0.45, "guard")] },
  blockHit: { len: 0.22, stepDur: 0.1, track: [k(0, "guard"), k(0.05, "blockHit", "out"), k(0.22, "block")] },
  stagger: { len: 1.0, stepDur: 0.12,
    track: [k(0, "guard"), k(0.08, "hitBig", "out"), k(0.3, "stagger"), k(0.55, "stagger", "io", { lean: -0.05, tilt: 0.25 }), k(0.8, "stagger"), k(1.0, "guard")] },
  knockdown: { len: 1.8, inv: [0.25, 1.8], stepDur: 0.12,
    track: [k(0, "guard"), k(0.08, "hitBig", "out"), k(0.32, "fall"), k(0.48, "lying", "out"), k(1.05, "lying"), k(1.3, "sitUp"), k(1.55, "kneel"), k(1.8, "guard")] },
  victory: { len: 0.45, hold: true, stepDur: 0.12, track: [k(0, "guard"), k(0.18, "victory", "io", { hipDy: 8 }), k(0.45, "victory", "out")] },
  ko: { len: 0.5, hold: true, inv: [0, 99], stepDur: 0.12,
    track: [k(0, "guard"), k(0.08, "hitBig", "out"), k(0.32, "fall"), k(0.5, "lying", "out")] },
};
for (const name in MOVES) MOVES[name].name = name;

export function lerpPose(a, b, u) {
  const o = {};
  for (const key in BASE) o[key] = a[key] + (b[key] - a[key]) * u;
  return o;
}

export function sampleMove(move, t, from) {
  const tr = move.track;
  for (let i = 0; i < tr.length - 1; i++) {
    const a = tr[i], b = tr[i + 1];
    if (t < b.t) {
      let u = (t - a.t) / (b.t - a.t);
      u = b.ease === "out" ? 1 - Math.pow(1 - u, 3) : u * u * (3 - 2 * u);
      return lerpPose(i === 0 ? from : a.p, b.p, u);
    }
  }
  return Object.assign({}, tr[tr.length - 1].p);
}

const add = (o, a, len) => [o[0] + Math.sin(a) * len, o[1] + Math.cos(a) * len];

/** Two-bone leg IK from the hip to an ankle target; the knee bends toward the opponent. Returns angles. */
function legIK(hip, t) {
  const dx = t[0] - hip[0], dy = t[1] - hip[1];
  const at = Math.atan2(dx, dy);
  const d = clamp(Math.hypot(dx, dy), 1, L.th + L.sh - 0.05);
  const a = Math.acos(clamp((L.th * L.th + d * d - L.sh * L.sh) / (2 * L.th * d), -1, 1));
  const h = at + a, knee = add(hip, h, L.th), an = add(hip, at, d);
  const sa = Math.atan2(an[0] - knee[0], an[1] - knee[1]);
  return { h, k: h - sa };
}

/** Pointed when the leg is raised, flat when standing (absolute foot angle). */
function fkFootAngle(h, k) {
  const flat = Math.max(0, 1 - Math.max(0, h - 0.45) / 0.9);
  return h - k + (PI / 2) * flat + (1 - flat) * 0.15;
}

/**
 * Builds joint positions. tF/tB: ankle targets for planted feet; faF/faB: planted foot angles;
 * gy: the ground's y (keyframed feet slide along it instead of going under). The whole body is
 * then rotated by p.rot about the belly.
 */
export function solve(p, tF, tB, faF, faB, gy = Infinity) {
  const hip = [p.hipDx, 0], ta = PI - p.lean;
  const shoulder = add(hip, ta, L.torso - 6);
  const neck = add(hip, ta, L.torso);
  const head = add(neck, PI - (p.lean * 0.6 + p.tilt), L.headR + 1);
  const arm = (s, e) => { const el = add(shoulder, s, L.ua); return { el, wr: add(el, s + e, L.fa) }; };
  const clampFloor = Math.abs(p.rot) < 0.3;
  const leg = (fh, fk, w, t, fa) => {
    let h = fh, kk = fk, foot = fkFootAngle(fh, fk);
    if (w > 0.001) {
      const ik = legIK(hip, t);
      h = fh + (ik.h - fh) * w; kk = fk + (ik.k - fk) * w; foot = foot + (fa - foot) * w;
    }
    const knee = add(hip, h, L.th);
    let an = add(knee, h - kk, L.sh);
    const floor = gy - FOOT.frontH;
    if (clampFloor && an[1] > floor && knee[1] < floor) {
      const dy = floor - knee[1], dx = Math.sqrt(Math.max(0, L.sh * L.sh - dy * dy));
      an = [knee[0] + (an[0] >= knee[0] ? dx : -dx), floor];
      foot = Math.min(foot, PI / 2);
    }
    const toe = add(an, foot, L.ft);
    if (clampFloor && toe[1] > gy - 2.5) toe[1] = gy - 2.5;
    return { knee, an, toe };
  };
  const s = {
    hip, shoulder, neck, head, aF: arm(p.aFs, p.aFe), aB: arm(p.aBs, p.aBe),
    lF: leg(p.lFh, p.lFk, p.ikF, tF, faF), lB: leg(p.lBh, p.lBk, p.ikB, tB, faB), headRot: p.rot,
  };
  if (Math.abs(p.rot) > 1e-4) {
    const c = Math.cos(p.rot), sn = Math.sin(p.rot), px = hip[0], py = -22;
    const r = (pt) => { const x = pt[0] - px, y = pt[1] - py; pt[0] = px + x * c - y * sn; pt[1] = py + x * sn + y * c; };
    for (const pt of [s.hip, s.shoulder, s.neck, s.head, s.aF.el, s.aF.wr, s.aB.el, s.aB.wr, s.lF.knee, s.lF.an, s.lF.toe, s.lB.knee, s.lB.an, s.lB.toe]) r(pt);
  }
  return s;
}

/** Lowest point of the body (largest y), allowing for limb thickness. */
export function lowestY(s) {
  let m = s.head[1] + L.headR + 1;
  for (const pt of [s.hip, s.shoulder, s.aF.el, s.aF.wr, s.aB.el, s.aB.wr, s.lF.knee, s.lF.an, s.lB.knee, s.lB.an]) m = Math.max(m, pt[1] + 5);
  return Math.max(m, s.lF.toe[1] + 2.5, s.lB.toe[1] + 2.5);
}
