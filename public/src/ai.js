// The computer opponent. It "presses buttons" like a player: each update it returns the same intent
// object as the keyboard, so it obeys every rule the player does (buffers, cooldowns, guard meter).
// It sees the other fighter a little late (its reaction time), which is what makes it beatable.
import { time, STAGE } from "./config.js";

/**
 * react: how late it sees you (s). defend: chance it reacts to an attack it sees coming.
 * punish: chance it hits back when you miss. aggr: how much it prefers attacking to waiting.
 * combo: chance it finishes a punch combo. think: time between decisions (s).
 * noise: how wrong it judges distance (px), so it sometimes swings from too far away.
 */
export const LEVELS = {
  Easy: { react: 0.4, defend: 0.25, punish: 0.2, aggr: 0.4, combo: 0.35, think: [0.4, 0.9], noise: 35 },
  Normal: { react: 0.26, defend: 0.5, punish: 0.5, aggr: 0.6, combo: 0.65, think: [0.22, 0.55], noise: 16 },
  Hard: { react: 0.17, defend: 0.78, punish: 0.85, aggr: 0.75, combo: 0.9, think: [0.12, 0.32], noise: 6 },
};
export const LEVEL_NAMES = Object.keys(LEVELS);

/**
 * Hip-to-hip distance (px) at which each attack connects, against a standing and a crouching fighter (measured).
 * Jump attacks are measured from where the jump starts. Punches go over a crouching fighter.
 */
const REACH = { jab: [0, 155], cross: [0, 165], upper: [0, 175], kick: [0, 170], heavy: [135, 185], low: [0, 195], fly: [265, 305], smash: [140, 265] };
const REACH_LOW = { kick: [130, 205], heavy: [165, 215], low: [0, 210], fly: [275, 335], smash: [140, 290] };
const HURT = new Set(["hitHigh", "hitGut", "blockHit", "stagger", "knockdown", "ko"]);
const DOWN = new Set(["knockdown", "ko"]);

const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
function pick(options) {
  let sum = 0;
  for (const o of options) sum += Math.max(0, o[0]);
  let r = Math.random() * sum;
  for (const o of options) if ((r -= Math.max(0, o[0])) <= 0) return o[1];
  return options[options.length - 1][1];
}

export function makeAI(level = "Normal") {
  return { level, hist: [], plan: [], planEnd: 0, hold: null, next: 0, target: 170, seen: "", punished: "", aaSeen: false, uses: {} };
}
export function resetAI(ai) {
  Object.assign(ai, { hist: [], plan: [], hold: null, next: 0, target: 170, seen: "", punished: "", aaSeen: false });
}

/** What the AI can see of the other fighter. */
function snap(o) {
  const m = o.move;
  return { t: time.gt, x: o.x, y: o.y, air: o.air, vx: o.vx, crouch: o.cw > 0.5, block: o.blocking, m, name: m ? m.name : "", mt: o.mt,
    key: m ? m.name + "@" + (time.gt - o.mt).toFixed(2) : "" };
}
function perceive(ai, at) {
  let s = ai.hist[0];
  for (const h of ai.hist) { if (h.t > at) break; s = h; }
  return s;
}

// ---------- plans: button presses in order, each waiting for its moment ----------
const free = (f) => !f.move && !f.air;
// Pressed once the strike is over, so it knows whether it landed; the button buffer carries it to the cancel point.
const chainReady = (name) => (f) => f.move && f.move.name === name && f.mt >= f.move.active[1];
const P = {
  combo: (n, L) => {
    const steps = [{ a: "punch", when: free }];
    if (n >= 2) steps.push({ a: "punch", when: chainReady("jab"), go: (f) => f.hitDone || chance(L.combo * 0.5) });
    if (n >= 3) steps.push({ a: "punch", when: chainReady("cross"), go: (f) => f.hitDone && chance(L.combo) });
    return steps;
  },
  kick: () => [{ a: "kick", when: free }],
  kickHeavy: () => [{ a: "kick", when: free }, { a: "heavy", when: chainReady("kick"), go: (f) => f.hitDone }],
  heavy: () => [{ a: "heavy", when: free }],
  sweep: () => [{ a: "kick", crouch: true, when: free }],
  // The down smash is pressed early in the jump; it comes down on a crouching or sweeping fighter.
  jumpIn: (smash) => [{ a: "jump", dir: 1, when: free },
    smash ? { a: "punch", when: (f) => f.air && f.vy < 300 } : { a: "kick", when: (f) => f.air && f.vy < 250 }],
  jumpBack: () => [{ a: "jump", dir: -1, when: free }],
  rollF: () => [{ a: "roll", dir: 1, when: free }],
  rollB: () => [{ a: "roll", dir: -1, when: free }],
};

function setPlan(ai, steps, life = 1.2) { ai.plan = steps; ai.planEnd = time.gt + life; ai.hold = null; }
function setHold(ai, h, dur) { ai.hold = { ...h, until: time.gt + dur }; ai.plan = []; }

const isLow = (o) => o.crouch || o.name === "low";
const inReach = (n, d, o) => { const r = (isLow(o) ? REACH_LOW : REACH)[n]; return !!r && d >= r[0] && d <= r[1]; };

/** A jump-in that reaches from this distance, or null. */
function jumpFor(d, o) {
  if (inReach("smash", d, o)) return P.jumpIn(true);
  if (inReach("fly", d, o)) return P.jumpIn(false);
  return null;
}

/** Best attack for a distance, given what the other fighter is doing. */
function attackFor(d, o, L, ai) {
  const opts = [];
  const inR = (n) => inReach(n, d, o);
  if (inR("jab")) opts.push([o.block ? 0.5 : 1.2, P.combo(3, L)]);
  if (inR("kick")) opts.push([isLow(o) ? 1.4 : 0.7, ai.level === "Hard" ? P.kickHeavy() : P.kick()]);
  if (inR("heavy")) opts.push([o.block ? 0.3 : 0.6, P.heavy()]);
  if (inR("low")) opts.push([o.block ? 1.6 : 0.45, P.sweep()]);
  return opts.length ? pick(opts) : null;
}

/** Returns this update's intent for fighter f against opp. */
export function aiIntent(f, opp, ai) {
  const L = LEVELS[ai.level], now = time.gt;
  ai.hist.push(snap(opp));
  while (ai.hist.length > 2 && ai.hist[1].t < now - 1) ai.hist.shift();
  const it = { dir: 0, speed: 1, crouch: false, block: false };
  if (f.hp <= 0 || opp.hp <= 0) { ai.plan = []; ai.hold = null; return it; }

  const o = perceive(ai, now - L.react);
  const toward = Math.sign(o.x - f.x) || f.sign, d = Math.abs(o.x - f.x);
  const dJudged = d + (Math.random() - 0.5) * 2 * L.noise;
  if (f.move && HURT.has(f.move.name)) { ai.plan = []; ai.hold = null; }
  if (ai.plan.length && now > ai.planEnd) ai.plan = [];
  if (ai.hold && now > ai.hold.until) ai.hold = null;
  const idle = free(f) && !ai.plan.length;

  // --- react to an attack coming at us ---
  if (o.m && o.m.atk && o.key !== ai.seen && o.mt < o.m.active[1]) {
    ai.seen = o.key;
    ai.uses[o.name] = (ai.uses[o.name] || 0) * 0.85 + 1;
    const reach = REACH[o.name] ? REACH[o.name][1] + 30 : 200;
    if (d < reach && free(f) && chance(L.defend)) {
      const lowGuard = f.guard < 40;
      if (o.m.low) setPlan(ai, jumpFor(d, o) || (chance(0.6) ? P.jumpBack() : P.rollB()), 0.6);
      else if (o.m.air) setHold(ai, { block: true }, 0.7);
      else if (o.name === "heavy" && lowGuard) setPlan(ai, P.rollB(), 0.4);
      else if (["jab", "cross", "upper"].includes(o.name) && chance(0.4)) setHold(ai, { crouch: true }, 0.45);
      else setHold(ai, { block: true }, o.name === "heavy" ? 0.6 : 0.42);
    }
  }

  // --- hit back when the other fighter misses, lands or has their guard broken ---
  const recovering = o.m && o.m.atk && !o.m.air && o.mt > o.m.active[1] + 0.02;
  const opening = recovering || o.name === "stagger" || o.name === "land";
  if (opening && o.key !== ai.punished && (free(f) || ai.hold)) {
    ai.punished = o.key;
    if (chance(o.name === "stagger" ? Math.max(L.punish, 0.6) : L.punish)) {
      let atk = o.name === "stagger" && d >= 135 && d <= 185 ? P.heavy() : attackFor(d, { ...o, block: false }, L, ai);
      if (atk) setPlan(ai, atk, 0.6);
      else if (d < 230) { ai.target = 145; setPlan(ai, [{ a: "punch", when: (ff) => free(ff) && Math.abs(opp.x - ff.x) < 150 }], 0.5); }
    }
  }

  // --- the other fighter jumping at us ---
  if (o.air && !ai.aaSeen && Math.sign(o.vx) === -toward && d < 320) {
    ai.aaSeen = true;
    if (free(f) && chance(L.defend)) {
      if (d < 210 && chance(0.35)) setPlan(ai, P.rollF(), 0.4);
      else setHold(ai, { block: true }, 0.75);
    }
  }
  if (!o.air) ai.aaSeen = false;

  // --- decide what to do next ---
  if (idle && !ai.hold && now >= ai.next) {
    ai.next = now + rnd(L.think[0], L.think[1]);
    const total = Object.values(ai.uses).reduce((a, b) => a + b, 0) || 1;
    const sweepy = (ai.uses.low || 0) / total;
    const wallBehind = toward > 0 ? f.x - STAGE.left : STAGE.right - f.x;
    if (DOWN.has(o.name)) ai.target = rnd(165, 200);
    else if (wallBehind < 70 && d < 175 && chance(0.35)) setPlan(ai, P.rollF(), 0.5);
    else if (f.guard < 30) { ai.target = rnd(210, 260); }
    else if (dJudged > 205) {
      const c = pick([
        [1.0, "walk"], [0.35 + sweepy, "wait"],
        [jumpFor(dJudged, o) ? L.aggr * (0.35 + sweepy) : 0, "jump"],
      ]);
      if (c === "walk") ai.target = rnd(140, 175);
      else if (c === "jump") setPlan(ai, jumpFor(dJudged, o), 1.2);
      else ai.target = d;
    } else {
      const atk = attackFor(dJudged, o, L, ai);
      const c = pick([
        [atk ? L.aggr * 2 : 0, "attack"],
        [dJudged > 160 ? 0.8 : 0, "stepIn"],
        [0.3, "back"],
        [(1 - L.aggr) * (dJudged < 190 ? 0.8 : 0.2), "guard"],
        [jumpFor(dJudged, o) ? L.aggr * (isLow(o) ? 0.6 + 2 * sweepy : 0.15) : 0, "jump"],
      ]);
      if (c === "attack") setPlan(ai, atk, 0.5);
      else if (c === "stepIn") {
        ai.target = 140;
        const follow = chance(0.5) ? P.combo(chance(L.combo) ? 3 : 2, L) : P.kick();
        follow[0].when = (ff) => free(ff) && Math.abs(opp.x - ff.x) < 158;
        setPlan(ai, follow, 1.0);
      } else if (c === "back") ai.target = rnd(200, 250);
      else if (c === "guard") setHold(ai, { block: true }, rnd(0.25, 0.6));
      else if (c === "jump") setPlan(ai, jumpFor(dJudged, o), 1.2);
    }
  }

  // --- carry out the plan ---
  const step = ai.plan[0];
  if (step && step.when(f)) {
    ai.plan.shift();
    if (step.go && !step.go(f)) ai.plan = [];
    else {
      it[step.a] = true;
      if (step.crouch) it.crouch = true;
      if (step.dir) it.dir = step.dir * toward;
    }
  }
  if (ai.hold) { it.block = !!ai.hold.block; it.crouch = !!ai.hold.crouch; }
  // walk to the distance it wants when nothing else is going on
  if (!it.dir && !ai.hold && free(f) && !it.jump && !it.roll) {
    const err = d - ai.target;
    if (Math.abs(err) > 12) it.dir = err > 0 ? toward : -toward;
  }
  return it;
}
