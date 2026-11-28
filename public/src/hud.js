// Health bars, guard meters, the practice-opponent label, banners and the controls line.
import { W, H, OUT } from "./config.js";
import { MAX_HP, MAX_GUARD } from "./fighter.js";

const BIG = '900 22px "Arial Black", Impact, system-ui, sans-serif';

function bar(g, x, y, w, h, frac, ghost, col, flip) {
  g.fillStyle = OUT; g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = "#4a3b46"; g.fillRect(x, y, w, h);
  const draw = (f, c) => { g.fillStyle = c; const fw = w * Math.max(0, f); g.fillRect(flip ? x + w - fw : x, y, fw, h); };
  if (ghost !== null) draw(ghost, "#fff4d6");
  draw(frac, col);
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x, y, w, h * 0.35);
}

function label(g, text, x, y, align, size = 15) {
  g.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  g.textAlign = align; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = 4; g.strokeStyle = OUT; g.strokeText(text, x, y);
  g.fillStyle = "#fff8ec"; g.fillText(text, x, y);
}

/** Bars ease down after damage so the lost chunk shows for a moment. */
export function hudTick(fs, dt) {
  for (const f of fs) {
    if (f.hpShown === undefined || f.hpShown < f.hp) f.hpShown = f.hp;
    f.hpShown += (f.hp - f.hpShown) * Math.min(1, dt * 3);
  }
}

export function drawHud(g, p1, p2, info) {
  const bw = 360, y = 22;
  for (const [f, x, flip, name] of [[p1, 24, false, "YOU"], [p2, W - 24 - bw, true, info.mode === "Fight" ? "CPU" : "PRACTICE"]]) {
    const hp = f.hp / MAX_HP, col = hp > 0.5 ? "#53d769" : hp > 0.25 ? "#ffc53a" : "#ff4d4d";
    bar(g, x, y, bw, 18, hp, f.hpShown / MAX_HP, col, flip);
    const broken = f.move && f.move.name === "stagger";
    bar(g, flip ? x + bw - 220 : x, y + 26, 220, 6, f.guard / MAX_GUARD, null, broken ? "#ff8a3d" : "#8fd8ff", flip);
    label(g, name, flip ? x + bw : x, y + 48, flip ? "right" : "left", 13);
  }
  const what = info.mode === "Fight" ? `CPU: ${info.level}  (1 2 3)` : `Practice: ${info.mode}`;
  label(g, what, W / 2, y + 9, "center", 13);
  label(g, "T: practice modes", W / 2, y + 28, "center", 11);

  const tag = info.banner || (!document.hasFocus() ? "CLICK TO PLAY" : info.paused ? "PAUSED" : info.slow ? "SLOW MOTION" : "");
  if (tag) {
    const size = info.banner ? 64 : 22;
    g.font = info.banner ? `900 ${size}px "Arial Black", Impact, system-ui, sans-serif` : BIG;
    g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = info.banner ? 12 : 5; g.strokeStyle = OUT; g.strokeText(tag, W / 2, info.banner ? 180 : 90);
    g.fillStyle = "#ffd93b"; g.fillText(tag, W / 2, info.banner ? 180 : 90);
  }

  const text = "A/D walk   W jump   S crouch   J punch (×3 combo)   K kick   L heavy   S+K sweep   I block   U roll   in air: J / K";
  g.font = "600 12px system-ui, -apple-system, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  const w = g.measureText(text).width + 24;
  g.fillStyle = "rgba(29,22,34,0.55)"; g.fillRect(W / 2 - w / 2, H - 32, w, 22);
  g.fillStyle = "#fff8ec"; g.fillText(text, W / 2, H - 21);
}
