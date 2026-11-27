// Game loop: fixed 60 Hz updates, drawing every screen frame.
import { W, H, DT, PAL, params, time } from "./config.js";
import { readP1, take } from "./input.js";
import { makeFighter, updateFighter, resolveSpacing, finishFighter, checkHit, startMove } from "./fighter.js";
import { drawFighter, drawRibbons, drawShadow, drawRig } from "./draw.js";
import { drawStage, updatePetals, drawPetals } from "./stage.js";
import { spawnHit, updateFx, drawFx, drawTrail } from "./fx.js";

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

const P1 = makeFighter("p1", 330, PAL.white, 1);
const P2 = makeFighter("p2", 630, PAL.blue, -1); // practice opponent
let paused = false, slow = params.has("slow"), showRig = params.has("rig");
let freeze = 0, shake = 0, camX = 0, camY = 0;

/** The practice opponent walks back to their spot after being knocked away. */
function dummyIntent(f) {
  const d = f.home - f.x;
  const dir = !f.move && f.idleT > 0.7 && Math.abs(d) > 12 ? Math.sign(d) : 0;
  if (dir) f.idleT = 0.8; // keep walking once started
  return { dir, speed: 0.55, punch: false };
}

function step(dt) {
  time.wt += dt;
  if (freeze > 0) freeze -= dt;
  else {
    time.gt += dt;
    updateFighter(P1, P2, dt, readP1());
    updateFighter(P2, P1, dt, dummyIntent(P2));
    resolveSpacing(P1, P2);
    finishFighter(P1, dt); finishFighter(P2, dt);
    const hit = checkHit(P1, P2);
    if (hit) {
      freeze = 0.08; shake = Math.max(shake, 3.2);
      spawnHit(hit.x, hit.y, hit.pow);
      startMove(P2, "hit");
      P2.vx = P1.sign * 280;
    }
  }
  updateFx(dt); updatePetals(dt);
  shake *= Math.exp(-dt * 10);
  camX = (Math.random() - 0.5) * 2 * shake; camY = (Math.random() - 0.5) * 2 * shake;
}

function hud() {
  const text = "A / D  walk     J  punch     `  skeleton     O  slow motion     P  pause";
  g.font = "600 13px system-ui, -apple-system, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  const w = g.measureText(text).width + 28;
  g.fillStyle = "rgba(29,22,34,0.55)";
  g.fillRect(W / 2 - w / 2, H - 34, w, 24);
  g.fillStyle = "#fff8ec"; g.fillText(text, W / 2, H - 22);
  const tag = !document.hasFocus() ? "CLICK TO PLAY" : paused ? "PAUSED" : slow ? "SLOW MOTION" : "";
  if (tag) {
    g.font = '900 22px "Arial Black", Impact, system-ui, sans-serif';
    g.lineWidth = 5; g.strokeStyle = "#1d1622"; g.strokeText(tag, W / 2, 34);
    g.fillStyle = "#ffd93b"; g.fillText(tag, W / 2, 34);
  }
}

function render() {
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.save();
  g.translate(camX, camY);
  drawStage(g);
  drawShadow(g, P2); drawShadow(g, P1);
  drawRibbons(g, P2); drawFighter(g, P2);
  drawTrail(g, P1.trail);
  drawRibbons(g, P1); drawFighter(g, P1);
  drawFx(g);
  drawPetals(g);
  if (showRig) { drawRig(g, P2); drawRig(g, P1); }
  g.restore();
  hud();
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
window.__kf = { P1, P2, time, step };
