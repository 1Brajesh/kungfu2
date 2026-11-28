// Game loop: fixed 60 Hz updates, drawing every screen frame.
import { W, H, DT, PAL, params, time } from "./config.js";
import { readP1, take } from "./input.js";
import { makeFighter, resetFighter, updateFighter, resolveSpacing, finishFighter, checkHit, applyHit, toWorld, TRAIL_LIFE } from "./fighter.js";
import { drawFighter, drawRibbons, drawShadow, drawRig, drawDizzy } from "./draw.js";
import { drawStage, updatePetals, drawPetals } from "./stage.js";
import { spawnHit, updateFx, drawFx, drawTrail, drawDust, drawFlash, fighterEvent, clearFx } from "./fx.js";
import { hudTick, drawHud } from "./hud.js";
import { makeAI, resetAI, aiIntent, LEVEL_NAMES } from "./ai.js";

const canvas = document.getElementById("game");
const g = canvas.getContext("2d");
let scale = 1;
function fit() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cw = Math.min(innerWidth, (innerHeight * W) / H), ch = (cw * H) / W;
  canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  scale = canvas.width / W;
}
addEventListener("resize", fit);
fit();

const START = [330, 630];
const P1 = makeFighter("p1", START[0], PAL.white, 1);
const P2 = makeFighter("p2", START[1], PAL.blue, -1); // computer opponent (or practice dummy)
let paused = false, slow = params.has("slow"), showRig = params.has("rig");
let freeze = 0, shake = 0, camX = 0, camY = 0, zoom = 0, zoomAt = [W / 2, H / 2];
let koT = -1, koSlow = 0, koFocus = null, lastAttacker = P1;
const KO_SLOW = 1.8; // s of real time the K.O. plays in slow motion

// --- opponent: "Fight" is the computer opponent; the rest are practice-dummy behaviours ---
const MODES = ["Fight", "Stand", "Block", "Crouch", "Jump"];
let mode = Math.max(0, MODES.indexOf(params.get("mode") || "Fight"));
const AI1 = params.has("demo") ? makeAI(LEVEL_NAMES.includes(params.get("demo")) ? params.get("demo") : "Normal") : null; // ?demo: the computer plays both sides
const AI = makeAI(LEVEL_NAMES.includes(params.get("level")) ? params.get("level") : "Normal");
P2.nextJump = 0;
function dummyIntent(f) {
  const it = { dir: 0, speed: 0.55, crouch: false, block: false };
  if (f.hp <= 0 || koT >= 0) return it;
  const d = f.home - f.x;
  if (!f.homing && !f.move && !f.air && f.idleT > 0.7 && Math.abs(d) > 14) f.homing = true;
  if (f.homing && (Math.abs(d) < 5 || f.move)) f.homing = false;
  if (f.homing) { it.dir = Math.sign(d); return it; }
  const m = MODES[mode];
  if (m === "Block") it.block = true;
  if (m === "Crouch") it.crouch = true;
  if (m === "Jump" && time.gt >= f.nextJump && !f.move && !f.air) { it.jump = true; f.nextJump = time.gt + 1.3; }
  return it;
}

// Hit-freeze (s) by what happened; normal hits add more for heavier blows.
const FREEZE = { hit: 0.05, block: 0.05, break: 0.14, kd: 0.14, ko: 0.3 };
function landHit(att, def) {
  const hit = checkHit(att, def);
  if (!hit) return;
  const r = applyHit(def, att, hit);
  lastAttacker = att;
  const big = r.kind === "kd" || r.kind === "ko" || r.kind === "break";
  freeze = Math.max(freeze, FREEZE[r.kind] + (r.kind === "hit" ? 0.03 * r.pow : 0));
  shake = Math.max(shake, (big ? 3.4 : 2.2) * r.pow);
  if (big || r.pow >= 1.5) { zoom = Math.max(zoom, r.kind === "ko" ? 0.14 : big ? 0.08 : 0.04); zoomAt = [hit.x, hit.y]; }
  spawnHit(hit.x, hit.y, r.pow, r.kind, att.sign);
  if (r.kind === "ko") { koT = 0; koSlow = KO_SLOW; koFocus = def; }
}

function resetRound() {
  resetFighter(P1, START[0], 1); resetFighter(P2, START[1], -1);
  P2.homing = false; koT = -1; koSlow = 0; koFocus = null; clearFx(); resetAI(AI); if (AI1) resetAI(AI1);
}

function step(dt) {
  time.wt += dt;
  if (koT >= 0 && (koT += dt) > 3.2) resetRound();
  if (take("KeyT")) { mode = (mode + 1) % MODES.length; P2.homing = false; resetAI(AI); }
  LEVEL_NAMES.forEach((n, i) => { if (take("Digit" + (i + 1))) { AI.level = n; mode = 0; } });
  if (freeze > 0) freeze -= dt;
  else {
    time.gt += dt;
    const i1 = koT >= 0 ? { dir: 0, speed: 1 } : AI1 ? aiIntent(P1, P2, AI1) : readP1();
    updateFighter(P1, P2, dt, i1);
    const i2 = koT >= 0 ? { dir: 0, speed: 1 } : MODES[mode] === "Fight" ? aiIntent(P2, P1, AI) : dummyIntent(P2);
    updateFighter(P2, P1, dt, i2);
    resolveSpacing(P1, P2);
    finishFighter(P1, dt); finishFighter(P2, dt);
    for (const f of [P1, P2]) {
      for (const e of f.events) {
        if (e.t === "slam") { const h = toWorld(f, f.sol.head)[0], b = toWorld(f, f.sol.hip)[0]; e.x = (h + b) / 2; shake = Math.max(shake, 3); }
        fighterEvent(e, f);
      }
      f.events.length = 0;
    }
    landHit(P1, P2);
    landHit(P2, P1);
    if (koFocus && koSlow > 0) {
      // follow the falling fighter in close-up while the K.O. plays slowly
      const h = toWorld(koFocus, koFocus.sol.hip);
      zoom += (0.16 - zoom) * Math.min(1, dt * 6);
      zoomAt = [zoomAt[0] + (h[0] - zoomAt[0]) * Math.min(1, dt * 5), zoomAt[1] + (h[1] - 40 - zoomAt[1]) * Math.min(1, dt * 5)];
    } else zoom *= Math.exp(-dt * 3);
  }
  updateFx(dt); updatePetals(dt); hudTick([P1, P2], dt);
  shake *= Math.exp(-dt * 10);
  camX = (Math.random() - 0.5) * 2 * shake; camY = (Math.random() - 0.5) * 2 * shake;
}

function render() {
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.save();
  g.translate(camX, camY);
  if (zoom > 0.002) { const z = 1 + zoom; g.translate(zoomAt[0], zoomAt[1]); g.scale(z, z); g.translate(-zoomAt[0], -zoomAt[1]); }
  drawStage(g);
  drawShadow(g, P2); drawShadow(g, P1);
  const order = lastAttacker === P1 ? [P2, P1] : [P1, P2];
  for (const f of order) { drawTrail(g, f.trail, TRAIL_LIFE); drawRibbons(g, f); drawFighter(g, f); }
  drawDust(g);
  for (const f of order) drawDizzy(g, f, time.wt);
  drawFx(g);
  drawPetals(g);
  if (showRig) for (const f of order) drawRig(g, f);
  g.restore();
  drawFlash(g);
  drawHud(g, P1, P2, { mode: MODES[mode], level: AI.level, paused, slow, banner: koT >= 0.15 ? "K.O.!" : "" });
}

let acc = 0, last = performance.now(), errShown = false;
function frame(now) {
  requestAnimationFrame(frame); // schedule first so one bad frame can't stop the game
  try {
    if (take("KeyP", "Escape")) paused = !paused;
    if (take("KeyO")) slow = !slow;
    if (take("Backquote")) showRig = !showRig;
    let fdt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (paused) fdt = 0;
    if (koSlow > 0 && freeze <= 0) {
      // after the impact freeze: very slow at first, easing back to full speed
      koSlow = Math.max(0, koSlow - fdt);
      const u = 1 - koSlow / KO_SLOW;
      fdt *= 0.18 + 0.82 * u * u;
    }
    acc += slow ? fdt * 0.25 : fdt;
    while (acc >= DT) { step(DT); acc -= DT; }
    render();
  } catch (e) {
    acc = 0;
    if (!errShown) { errShown = true; console.error(e); }
  }
}
requestAnimationFrame(frame);
canvas.tabIndex = 0;
canvas.addEventListener("pointerdown", () => { canvas.focus(); window.focus(); });
canvas.focus();
document.getElementById("nojs")?.remove();

// Test hook for screenshot scripts.
window.__kf = { P1, P2, AI, AI1, time, step, reset: resetRound, setMode: (m) => { mode = MODES.indexOf(m); } };
