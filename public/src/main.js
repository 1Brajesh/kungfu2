// Game loop (fixed 60 Hz updates, drawing every screen frame) and the flow between screens:
//   title    two computer fighters spar behind the logo and the menu
//   match    you against the computer: best of 3 rounds, 60 s each
//   practice you against a practice dummy (or the computer), no rounds; T, 1/2/3 and B change things
//   demo     (?demo) the computer plays both sides, for testing
import { W, H, DT, PAL, params, time } from "./config.js";
import { readP1, take, clearPressed, anyPressed } from "./input.js";
import { makeFighter, resetFighter, updateFighter, resolveSpacing, finishFighter, checkHit, applyHit, startMove, toWorld, TRAIL_LIFE } from "./fighter.js";
import { drawFighter, drawRibbons, drawShadow, drawRig, drawDizzy, tintPal } from "./draw.js";
import { STAGES } from "./stage.js";
import { spawnHit, updateFx, drawFx, drawTrail, drawDust, drawFlash, fighterEvent, clearFx, setDustColors } from "./fx.js";
import { hudTick, drawHud } from "./hud.js";
import { makeAI, resetAI, aiIntent, LEVEL_NAMES } from "./ai.js";
import { makeMenu, menuKeys, menuPointer, drawMenu, drawLogo, drawControls, dim, drawText } from "./menu.js";
import { touch, initTouch, drawTouch, resetTouch, isPortrait } from "./touch.js";

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

// --- settings, remembered between visits ---
const settings = { level: "Normal", stage: "temple" };
try { Object.assign(settings, JSON.parse(localStorage.getItem("kf2.settings") || "{}")); } catch { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem("kf2.settings", JSON.stringify(settings)); } catch { /* ignore */ } };
if (!LEVEL_NAMES.includes(settings.level)) settings.level = "Normal";
if (LEVEL_NAMES.includes(params.get("level"))) settings.level = params.get("level");

const START = [330, 630];
const P1 = makeFighter("p1", START[0], PAL.white, 1);
const P2 = makeFighter("p2", START[1], PAL.blue, -1);
let slow = params.has("slow"), showRig = params.has("rig");
let freeze = 0, shake = 0, camX = 0, camY = 0, zoom = 0, zoomAt = [W / 2, H / 2];

// --- stage ---
let stageI = 0, stage, pals;
function setStage(i) {
  stageI = (i + STAGES.length) % STAGES.length; stage = STAGES[stageI];
  pals = new Map([[P1, tintPal(P1.pal, stage.tint)], [P2, tintPal(P2.pal, stage.tint)]]);
  setDustColors(stage.dust[0], stage.dust[1]);
}
const stageIndex = (id) => (id === "random" ? Math.floor(Math.random() * STAGES.length) : Math.max(0, STAGES.findIndex((s) => s.id === id)));
setStage(stageIndex(params.get("stage") || settings.stage));

let koT = -1, koSlow = 0, koFocus = null, lastAttacker = P1;
const KO_SLOW = 1.8; // s of real time the K.O. plays in slow motion

// --- who controls the fighters ---
const AI = makeAI(settings.level);    // the computer opponent (P2)
const AI1 = makeAI("Normal");          // plays P1 on the title screen and in ?demo
const MODES = ["Stand", "Block", "Crouch", "Jump", "CPU"]; // practice opponent
let mode = 0;
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

// --- scenes ---
const ROUND_TIME = 60, WINS_NEEDED = 2;
let scene = "title", menu = null, showControls = false;
/** phase: intro (ROUND n / FIGHT!), fight, end (K.O. or time up), over (match result) */
const match = { round: 1, wins: [0, 0], phase: "intro", t: 0, timer: ROUND_TIME, winner: null, why: "" };

function resetFighters() {
  resetFighter(P1, START[0], 1); resetFighter(P2, START[1], -1);
  P2.homing = false; koT = -1; koSlow = 0; koFocus = null; zoom = 0; freeze = 0; clearFx(); resetAI(AI); resetAI(AI1);
}

function startRound() {
  resetFighters();
  Object.assign(match, { phase: "intro", t: 0, timer: ROUND_TIME, winner: null, why: "" });
}
function startMatch() {
  scene = "match"; menu = null; clearPressed();
  AI.level = settings.level;
  setStage(stageIndex(settings.stage));
  match.round = 1; match.wins = [0, 0];
  startRound();
}
function startPractice() {
  scene = "practice"; menu = null; clearPressed();
  AI.level = settings.level; mode = 0;
  setStage(stageIndex(settings.stage));
  resetFighters();
}
function goTitle() {
  scene = "title"; clearPressed(); resetTouch(); showControls = false;
  setStage(stageIndex(settings.stage));
  resetFighters();
  menu = titleMenu();
}

const STAGE_IDS = [...STAGES.map((s) => s.id), "random"];
const STAGE_NAMES = [...STAGES.map((s) => s.name), "Random"];
function titleMenu() {
  return makeMenu([
    { label: "FIGHT", action: "fight" },
    { label: "PRACTICE", action: "practice" },
    { label: "CPU LEVEL", values: LEVEL_NAMES, index: LEVEL_NAMES.indexOf(settings.level),
      onChange: (i) => { settings.level = LEVEL_NAMES[i]; saveSettings(); } },
    { label: "STAGE", values: STAGE_NAMES, index: Math.max(0, STAGE_IDS.indexOf(settings.stage)),
      onChange: (i) => { settings.stage = STAGE_IDS[i]; saveSettings(); if (STAGE_IDS[i] !== "random") setStage(i); } },
    { label: "CONTROLS", action: "controls" },
  ], { kind: "title" });
}
function pauseMenu() {
  const items = [
    { label: "RESUME", action: "resume" },
    { label: scene === "match" ? "RESTART MATCH" : "RESET", action: "restart" },
    { label: "MAIN MENU", action: "title" },
  ];
  // practice settings live here too, so they can be changed without a keyboard
  if (scene === "practice") items.splice(1, 0,
    { label: "OPPONENT", values: MODES, index: mode, onChange: (i) => { mode = i; P2.homing = false; resetAI(AI); } },
    { label: "CPU LEVEL", values: LEVEL_NAMES, index: LEVEL_NAMES.indexOf(AI.level), onChange: (i) => { AI.level = LEVEL_NAMES[i]; } },
    { label: "STAGE", values: STAGES.map((st) => st.name), index: stageI, onChange: (i) => setStage(i) });
  return makeMenu(items, { kind: "pause" });
}
function openPause() { menu = pauseMenu(); clearPressed(); resetTouch(); }
const overMenu = () => makeMenu([{ label: "REMATCH", action: "fight" }, { label: "MAIN MENU", action: "title" }], { kind: "over" });

function doAction(a) {
  if (!a) return;
  if (a === "fight") startMatch();
  else if (a === "practice") startPractice();
  else if (a === "controls") showControls = true;
  else if (a === "resume") { menu = null; clearPressed(); }
  else if (a === "restart") { if (scene === "match") startMatch(); else startPractice(); }
  else if (a === "title") goTitle();
}

const paused = () => !!menu && menu.kind === "pause";

// --- hits ---
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
  if (r.kind !== "block") stage.impact(hit.x, hit.y, r.kind === "ko" ? 2.4 : r.kind === "kd" || r.kind === "break" ? Math.max(1.6, r.pow) : r.pow);
  if (r.kind === "ko") {
    koT = 0; koSlow = KO_SLOW; koFocus = def;
    if (scene === "match" && match.phase === "fight") endRound(att, "ko");
  }
}

function endRound(winner, why) {
  match.phase = "end"; match.t = 0; match.winner = winner; match.why = why;
  if (winner) match.wins[winner === P1 ? 0 : 1]++;
}

const IDLE = { dir: 0, speed: 1 };
function intents() {
  if (scene === "title" || scene === "demo") {
    return koT >= 0 ? [IDLE, IDLE] : [aiIntent(P1, P2, AI1), aiIntent(P2, P1, AI)];
  }
  const live = scene === "practice" ? koT < 0 : match.phase === "fight";
  const i1 = live ? readP1() : IDLE;
  if (!live) return [i1, IDLE];
  if (scene === "practice" && MODES[mode] !== "CPU") return [i1, dummyIntent(P2)];
  return [i1, aiIntent(P2, P1, AI)];
}

function stepMatch(dt) {
  match.t += dt;
  if (match.phase === "intro" && match.t >= 1.7) { match.phase = "fight"; match.t = 0; }
  else if (match.phase === "fight" && freeze <= 0) {
    match.timer = Math.max(0, match.timer - dt);
    if (match.timer <= 0) {
      const w = P1.hp > P2.hp ? P1 : P2.hp > P1.hp ? P2 : null;
      endRound(w, "time");
    }
  } else if (match.phase === "end") {
    // the winner celebrates once things have settled
    if (match.t > (match.why === "ko" ? 1.6 : 1.2)) celebrate(match.winner);
    if (match.t > (match.why === "ko" ? 3.6 : 3.0)) {
      if (match.wins.some((n) => n >= WINS_NEEDED)) { match.phase = "over"; match.t = 0; menu = overMenu(); clearPressed(); resetTouch(); }
      else { match.round++; startRound(); }
    }
  } else if (match.phase === "over") celebrate(match.winner);
}
function celebrate(w) { if (w && w.hp > 0 && !w.move && !w.air) startMove(w, "victory"); }

function step(dt) {
  time.wt += dt;
  if (koT >= 0) koT += dt;
  if (scene === "match") stepMatch(dt);
  else if (koT > 3.2) resetFighters(); // practice, title, demo: just start again
  if (scene === "practice" && !menu) {
    if (take("KeyB")) setStage(stageI + 1);
    if (take("KeyT")) { mode = (mode + 1) % MODES.length; P2.homing = false; resetAI(AI); }
    LEVEL_NAMES.forEach((n, i) => { if (take("Digit" + (i + 1))) { AI.level = n; mode = MODES.indexOf("CPU"); } });
  }
  if (freeze > 0) freeze -= dt;
  else {
    time.gt += dt;
    const [i1, i2] = intents();
    updateFighter(P1, P2, dt, i1);
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
    if (scene !== "match" || match.phase === "fight") { landHit(P1, P2); landHit(P2, P1); }
    if (koFocus && koSlow > 0) {
      // follow the falling fighter in close-up while the K.O. plays slowly
      const h = toWorld(koFocus, koFocus.sol.hip);
      zoom += (0.16 - zoom) * Math.min(1, dt * 6);
      zoomAt = [zoomAt[0] + (h[0] - zoomAt[0]) * Math.min(1, dt * 5), zoomAt[1] + (h[1] - 40 - zoomAt[1]) * Math.min(1, dt * 5)];
    } else zoom *= Math.exp(-dt * 3);
  }
  updateFx(dt); stage.update(dt); hudTick([P1, P2], dt);
  shake *= Math.exp(-dt * 10);
  camX = (Math.random() - 0.5) * 2 * shake; camY = (Math.random() - 0.5) * 2 * shake;
}

// --- what the HUD shows ---
function banner() {
  if (scene === "title") return null;
  if (scene === "match") {
    const m = match;
    if (m.phase === "intro") {
      const final = m.wins[0] === WINS_NEEDED - 1 && m.wins[1] === WINS_NEEDED - 1;
      return m.t < 1.05 ? { text: final ? "FINAL ROUND" : `ROUND ${m.round}`, t: m.t } : { text: "FIGHT!", t: m.t - 1.05, hot: true };
    }
    if (m.phase === "fight" && m.t < 0.45 && m.round) return { text: "FIGHT!", t: m.t + 0.65, hot: true };
    if (m.phase === "end") {
      const first = m.why === "ko" ? "K.O.!" : "TIME!";
      if (m.t < 1.5) return m.t > 0.1 ? { text: first, t: m.t - 0.1 } : null;
      const who = !m.winner ? "DRAW" : m.winner === P1 ? "YOU WIN THE ROUND" : "CPU WINS THE ROUND";
      return { text: who, t: m.t - 1.5, small: true };
    }
    if (m.phase === "over") return { text: m.winner === P1 ? "YOU WIN!" : "YOU LOSE", t: m.t, hot: m.winner === P1 };
    return null;
  }
  return koT >= 0.15 ? { text: "K.O.!", t: koT - 0.15 } : null;
}

function render() {
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.save();
  g.translate(camX, camY);
  if (zoom > 0.002) { const z = 1 + zoom; g.translate(zoomAt[0], zoomAt[1]); g.scale(z, z); g.translate(-zoomAt[0], -zoomAt[1]); }
  stage.back(g);
  drawShadow(g, P2, stage.shadow); drawShadow(g, P1, stage.shadow);
  const order = lastAttacker === P1 ? [P2, P1] : [P1, P2];
  for (const f of order) { drawTrail(g, f.trail, TRAIL_LIFE); drawRibbons(g, f, pals.get(f)); drawFighter(g, f, pals.get(f)); }
  drawDust(g);
  for (const f of order) drawDizzy(g, f, time.wt);
  drawFx(g);
  stage.front(g);
  if (showRig) for (const f of order) drawRig(g, f);
  g.restore();
  drawFlash(g);

  if (scene === "title") {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "rgba(23,18,29,0.15)"); gr.addColorStop(0.5, "rgba(23,18,29,0.35)"); gr.addColorStop(1, "rgba(23,18,29,0.6)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    drawLogo(g, W / 2, 112, time.wt);
    drawMenu(g, menu, W / 2, 232, time.wt);
    if (showControls) drawControls(g);
    return;
  }
  drawHud(g, P1, P2, {
    scene, mode: MODES[mode], level: AI.level, stage: stage.name, slow, banner: banner(),
    timer: scene === "match" ? Math.ceil(match.timer) : null, wins: scene === "match" ? match.wins : null, touch: touch.on,
  });
  if (menu) {
    const top = menu.kind === "pause" ? Math.max(150, 300 - menu.items.length * 30) : 300;
    if (menu.kind === "pause") { dim(g, 0.5); drawText(g, "PAUSED", W / 2, top - 55, 44, "#ffd93b", "center", 10); }
    drawMenu(g, menu, W / 2, top, time.wt);
  } else if (!showControls && (scene === "match" || scene === "practice")) drawTouch(g);
}

// --- the loop ---
let acc = 0, last = performance.now(), errShown = false;
function frame(now) {
  requestAnimationFrame(frame); // schedule first so one bad frame can't stop the game
  try {
    let fdt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (take("KeyO")) slow = !slow;
    if (take("Backquote")) showRig = !showRig;
    if (showControls) { if (anyPressed()) showControls = false; }
    else if (menu) {
      if (menu.kind === "pause" && take("Escape", "KeyP")) doAction("resume");
      else doAction(menuKeys(menu));
    } else if ((scene === "match" || scene === "practice") && (take("Escape", "KeyP") || isPortrait())) openPause();
    if (paused()) fdt = 0;
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

canvas.tabIndex = 0;
canvas.addEventListener("pointerdown", (e) => {
  canvas.focus(); window.focus();
  if (showControls) { showControls = false; return; }
  if (!menu) return;
  const r = canvas.getBoundingClientRect();
  doAction(menuPointer(menu, ((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H));
});
canvas.focus();
document.getElementById("nojs")?.remove();
initTouch(canvas, { active: () => !menu && !showControls && (scene === "match" || scene === "practice"), onPause: openPause });

// Where to start. ?demo: computer vs computer; ?mode=Block (or Stand, Crouch, Jump, CPU): practice; ?fight: straight into a match.
if (params.has("demo")) {
  scene = "demo";
  if (LEVEL_NAMES.includes(params.get("demo"))) AI1.level = params.get("demo");
  resetFighters();
} else if (params.has("mode")) {
  startPractice();
  mode = Math.max(0, MODES.indexOf(params.get("mode") === "Fight" ? "CPU" : params.get("mode")));
} else if (params.has("fight")) startMatch();
else goTitle();
if (params.has("stage")) setStage(stageIndex(params.get("stage")));
requestAnimationFrame(frame);

// Test hook for screenshot scripts.
window.__kf = {
  P1, P2, AI, AI1, time, step, match, reset: resetFighters, startMatch, goTitle, doAction,
  setMode: (m) => { mode = Math.max(0, MODES.indexOf(m === "Fight" ? "CPU" : m)); },
  get scene() { return scene; }, get menu() { return menu; },
};
