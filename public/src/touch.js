// On-screen controls for phones and tablets. They show once the screen is touched (or with ?touch)
// and turn into the same keys the keyboard uses, so the game itself doesn't know the difference.
//   Left half of the screen: a floating stick (left/right walk, up jumps, down crouches).
//   Bottom right: punch, kick, heavy, block (hold) and roll. A finger can slide from button to button.
//   Top middle: pause.
import { W, H, OUT, PI, params } from "./config.js";
import { touchPress, touchHold, touchRelease } from "./input.js";

export const touch = { on: params.has("touch") };

const BUTTONS = [
  { code: "KeyJ", label: "PUNCH", x: 885, y: 440, r: 46, col: "#ffd93b" },
  { code: "KeyK", label: "KICK", x: 790, y: 485, r: 44, col: "#8fd8ff" },
  { code: "KeyL", label: "HEAVY", x: 790, y: 385, r: 38, col: "#ff8a3d" },
  { code: "KeyI", label: "BLOCK", x: 695, y: 500, r: 38, col: "#b9f0a0", hold: true },
  { code: "KeyU", label: "ROLL", x: 885, y: 335, r: 34, col: "#e3b8ff" },
];
const PAUSE = { x: W / 2, y: 92, r: 20 };
const STICK = { x: 130, y: 430, r: 64, travel: 50 };
const DEAD = 18, UP = 32, DOWN = 26;

const ptrs = new Map();   // pointerId -> { kind: "stick" | "btn", btn, ox, oy, x, y, up }
let canvasEl = null, hooks = null;

function toGame(e) {
  const r = canvasEl.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
function buttonAt(x, y) {
  let best = null, bd = Infinity;
  for (const b of BUTTONS) { const d = Math.hypot(x - b.x, y - b.y); if (d < b.r * 1.3 && d < bd) { best = b; bd = d; } }
  return best;
}
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* not supported */ } };

/** Which of left/right/crouch the stick is holding, and a jump the moment it's pushed up. */
function applyStick(p) {
  const dx = p.x - p.ox, dy = p.y - p.oy;
  touchHold("KeyA", dx < -DEAD); touchHold("KeyD", dx > DEAD);
  touchHold("KeyS", dy > DOWN && Math.abs(dy) > Math.abs(dx) * 0.6);
  const up = dy < -UP;
  if (up && !p.up) touchPress("KeyW");
  p.up = up;
}
function pressButton(p, b) {
  if (p.btn && p.btn !== b && p.btn.hold) touchHold(p.btn.code, false);
  p.btn = b;
  if (!b) return;
  touchPress(b.code); buzz();
  if (b.hold) touchHold(b.code, true);
}
function release(p) {
  if (p.kind === "stick") { touchHold("KeyA", false); touchHold("KeyD", false); touchHold("KeyS", false); }
  else if (p.btn && p.btn.hold) touchHold(p.btn.code, false);
}

function down(e) {
  if (e.pointerType === "mouse") return;
  if (!touch.on) { touch.on = true; goFullscreen(); }
  if (!hooks.active()) return;
  const [x, y] = toGame(e);
  if (Math.hypot(x - PAUSE.x, y - PAUSE.y) < PAUSE.r * 1.8) { release({ kind: "stick" }); touchRelease(); ptrs.clear(); hooks.onPause(); return; }
  if (x < W * 0.45) {
    for (const q of ptrs.values()) if (q.kind === "stick") return; // one stick at a time
    ptrs.set(e.pointerId, { kind: "stick", ox: x, oy: y, x, y, up: false });
  } else {
    const p = { kind: "btn", btn: null };
    ptrs.set(e.pointerId, p);
    pressButton(p, buttonAt(x, y));
  }
  e.preventDefault();
}
function move(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const [x, y] = toGame(e);
  if (p.kind === "stick") {
    p.x = x; p.y = y;
    // the stick's centre follows the finger if it goes far, so it never feels stuck
    const dx = x - p.ox, dy = y - p.oy, d = Math.hypot(dx, dy), max = STICK.travel * 1.6;
    if (d > max) { p.ox = x - (dx / d) * max; p.oy = y - (dy / d) * max; }
    applyStick(p);
  } else {
    const b = buttonAt(x, y);
    if (b && b !== p.btn) pressButton(p, b);
  }
  e.preventDefault();
}
function up(e) {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  release(p); ptrs.delete(e.pointerId);
}

function goFullscreen() {
  // Android browsers allow full screen and a landscape lock; iPhones ignore this.
  const el = document.documentElement;
  try { el.requestFullscreen?.({ navigationUI: "hide" })?.then(() => screen.orientation?.lock?.("landscape")).catch(() => {}); } catch { /* ignore */ }
}

/** hooks: active() — true when the fight takes input; onPause() — open the pause menu. */
export function initTouch(canvas, h) {
  canvasEl = canvas; hooks = h;
  addEventListener("pointerdown", down, { passive: false });
  addEventListener("pointermove", move, { passive: false });
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
  // a real keyboard hides the touch controls again
  addEventListener("keydown", () => { if (!params.has("touch")) touch.on = false; });
  addEventListener("blur", () => { ptrs.clear(); touchRelease(); });
}

/** Lets go of everything (when a menu opens, a round ends, and so on). */
export function resetTouch() { for (const p of ptrs.values()) release(p); ptrs.clear(); touchRelease(); }

/** A phone held upright (index.html then shows "turn your phone sideways"). */
export const isPortrait = () => touch.on && innerHeight > innerWidth;

function ring(g, x, y, r, fill, line = 4) {
  g.beginPath(); g.arc(x, y, r, 0, PI * 2);
  g.fillStyle = fill; g.fill(); g.lineWidth = line; g.strokeStyle = "rgba(29,22,34,0.75)"; g.stroke();
}

export function drawTouch(g) {
  if (!touch.on) return;
  g.save();
  // stick
  let st = null;
  for (const p of ptrs.values()) if (p.kind === "stick") st = p;
  const ox = st ? st.ox : STICK.x, oy = st ? st.oy : STICK.y;
  ring(g, ox, oy, STICK.r, "rgba(255,248,236,0.18)");
  let kx = ox, ky = oy;
  if (st) { const dx = st.x - ox, dy = st.y - oy, d = Math.hypot(dx, dy) || 1, k = Math.min(d, STICK.travel) / d; kx = ox + dx * k; ky = oy + dy * k; }
  ring(g, kx, ky, 28, st ? "rgba(255,217,59,0.85)" : "rgba(255,248,236,0.55)");
  // buttons
  const held = new Set([...ptrs.values()].filter((p) => p.btn).map((p) => p.btn));
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  for (const b of BUTTONS) {
    const on = held.has(b);
    ring(g, b.x, b.y, b.r * (on ? 0.93 : 1), on ? b.col : "rgba(255,248,236,0.28)");
    if (!on) { g.beginPath(); g.arc(b.x, b.y, b.r - 6, 0, PI * 2); g.lineWidth = 3; g.strokeStyle = b.col; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1; }
    g.font = `900 ${b.r > 40 ? 14 : 12}px "Arial Black", Impact, system-ui, sans-serif`;
    g.lineWidth = 4; g.strokeStyle = OUT; g.strokeText(b.label, b.x, b.y + 1);
    g.fillStyle = "#fff8ec"; g.fillText(b.label, b.x, b.y + 1);
  }
  // pause
  ring(g, PAUSE.x, PAUSE.y, PAUSE.r, "rgba(255,248,236,0.4)", 3);
  g.fillStyle = OUT; g.fillRect(PAUSE.x - 6, PAUSE.y - 7, 4, 14); g.fillRect(PAUSE.x + 2, PAUSE.y - 7, 4, 14);
  g.restore();
}
