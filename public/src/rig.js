// Poses, moves and the skeleton maths.
// Local coords: facing right (+x toward the opponent), y down, hip at the origin, in skeleton units.
// Angles: 0 = straight down, + = rotated toward the opponent.
import { L, PI, clamp } from "./config.js";

/** Stance: hip height above the ground and where each ankle rests relative to the hip. */
export const STANCE = { hipH: 70, front: 14, back: -36 };
/** Front foot is flat; back foot is up on the ball of the foot (heel raised). */
export const FOOT = { frontAng: 1.48, frontH: 3.7, backAng: 0.95, backH: 10 };

/** Upper-body pose plus hip offsets. hipDx: hip forward, hipDy: hip lower, reachF: front foot rests further forward. */
export const UPPER = { lean: 0.12, tilt: 0, aFs: 0.75, aFe: 1.85, aBs: 0.45, aBe: 2.1, hipDx: 0, hipDy: 0, reachF: 0 };
const POSES = {
  guard: {},
  punchWind: { lean: 0.04, aFs: 0.5, aFe: 2.25, aBs: 0.6, aBe: 1.9, hipDx: -2, reachF: 10 },
  punch: { lean: 0.34, aFs: 1.52, aFe: 0.04, aBs: -0.25, aBe: 2.3, hipDx: 9, hipDy: 4, reachF: 10 },
  hit: { lean: -0.38, tilt: -0.35, aFs: 0.3, aFe: 1.4, aBs: 0.1, aBe: 1.2, hipDx: -5, hipDy: 1 },
};
const key = (t, name, ease = "io") => ({ t, ease, p: Object.assign({}, UPPER, POSES[name]) });

/**
 * A move is a keyframe track over time (s). The first key is replaced by the pose the body was in
 * when the move started, so moves blend out of whatever came before.
 * cancel: from this time a new move may start; active: window in which the strike can land.
 */
export const MOVES = {
  punch: {
    name: "punch", len: 0.42, cancel: 0.3, active: [0.11, 0.22], limb: "fist", pow: 1, stepDur: 0.09,
    track: [key(0, "guard"), key(0.06, "punchWind"), key(0.13, "punch", "out"), key(0.24, "punch"), key(0.42, "guard")],
  },
  hit: {
    name: "hit", len: 0.5, cancel: 0.5, stepDur: 0.1,
    track: [key(0, "guard"), key(0.05, "hit", "out"), key(0.22, "hit"), key(0.5, "guard")],
  },
};

export function sampleMove(move, t, from) {
  const tr = move.track;
  for (let i = 0; i < tr.length - 1; i++) {
    const a = tr[i], b = tr[i + 1];
    if (t < b.t) {
      const ap = i === 0 ? from : a.p;
      let u = (t - a.t) / (b.t - a.t);
      u = b.ease === "out" ? 1 - Math.pow(1 - u, 3) : u * u * (3 - 2 * u);
      const o = {};
      for (const k in b.p) o[k] = ap[k] + (b.p[k] - ap[k]) * u;
      return o;
    }
  }
  return Object.assign({}, tr[tr.length - 1].p);
}

const add = (o, a, len) => [o[0] + Math.sin(a) * len, o[1] + Math.cos(a) * len];

/** Two-bone leg IK from the hip (origin) to an ankle target; the knee bends toward the opponent. */
function legIK(t) {
  const at = Math.atan2(t[0], t[1]);
  const d = clamp(Math.hypot(t[0], t[1]), 1, L.th + L.sh - 0.05);
  const a = Math.acos(clamp((L.th * L.th + d * d - L.sh * L.sh) / (2 * L.th * d), -1, 1));
  return { knee: add([0, 0], at + a, L.th), an: add([0, 0], at, d) };
}

/** Builds joint positions. tF/tB: ankle targets; faF/faB: absolute foot angles. */
export function solve(p, tF, tB, faF, faB) {
  const hip = [0, 0], ta = PI - p.lean;
  const shoulder = add(hip, ta, L.torso - 6);
  const neck = add(hip, ta, L.torso);
  const head = add(neck, PI - (p.lean * 0.6 + p.tilt), L.headR + 1);
  const arm = (s, e) => { const el = add(shoulder, s, L.ua); return { el, wr: add(el, s + e, L.fa) }; };
  const leg = (t, fa) => { const { knee, an } = legIK(t); return { knee, an, toe: add(an, fa, L.ft) }; };
  return { hip, shoulder, neck, head, aF: arm(p.aFs, p.aFe), aB: arm(p.aBs, p.aBe), lF: leg(tF, faF), lB: leg(tB, faB) };
}
