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

function pip(g, x, y, on) {
  g.fillStyle = OUT; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
  g.fillStyle = on ? "#ffd93b" : "#4a3b46"; g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill();
  if (on) { g.fillStyle = "rgba(255,255,255,0.6)"; g.beginPath(); g.arc(x - 1.5, y - 1.5, 2, 0, Math.PI * 2); g.fill(); }
}

/** A big centred word that pops in: ROUND 1, FIGHT!, K.O.!, TIME!, YOU WIN! */
function drawBanner(g, b) {
  const size = b.small ? 40 : 64, t = Math.max(0, b.t);
  const s = t < 0.12 ? 0.4 + (t / 0.12) * 0.85 : t < 0.25 ? 1.25 - ((t - 0.12) / 0.13) * 0.25 : 1;
  g.save(); g.translate(W / 2, 180); g.scale(s, s); g.rotate(b.small ? 0 : -0.03);
  g.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = b.small ? 10 : 14; g.strokeStyle = OUT; g.strokeText(b.text, 0, 0);
  g.fillStyle = "#c0392b"; g.fillText(b.text, 0, 5);
  g.fillStyle = b.hot ? "#ff8a3d" : "#ffd93b"; g.fillText(b.text, 0, 0);
  g.restore();
}

function footer(g, text, y) {
  g.font = "600 12px system-ui, -apple-system, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  const w = g.measureText(text).width + 24;
  g.fillStyle = "rgba(29,22,34,0.55)"; g.fillRect(W / 2 - w / 2, y - 11, w, 22);
  g.fillStyle = "#fff8ec"; g.fillText(text, W / 2, y);
}

/**
 * info: scene, mode (practice opponent), level, stage, slow, banner {text, t, hot, small},
 * timer (s, match only), wins [p1, p2] (match only).
 */
export function drawHud(g, p1, p2, info) {
  const bw = 360, y = 22;
  const cpu = info.scene !== "practice" || info.mode === "CPU";
  const names = ["YOU", cpu ? `CPU · ${info.level.toUpperCase()}` : "PRACTICE"];
  if (info.scene === "demo") names[0] = "CPU";
  [[p1, 24, false], [p2, W - 24 - bw, true]].forEach(([f, x, flip], i) => {
    const hp = f.hp / MAX_HP, col = hp > 0.5 ? "#53d769" : hp > 0.25 ? "#ffc53a" : "#ff4d4d";
    bar(g, x, y, bw, 18, hp, f.hpShown / MAX_HP, col, flip);
    const broken = f.move && f.move.name === "stagger";
    bar(g, flip ? x + bw - 220 : x, y + 26, 220, 6, f.guard / MAX_GUARD, null, broken ? "#ff8a3d" : "#8fd8ff", flip);
    label(g, names[i], flip ? x + bw : x, y + 48, flip ? "right" : "left", 13);
    if (info.wins) for (let k = 0; k < 2; k++) pip(g, flip ? x + 12 + k * 22 : x + bw - 12 - k * 22, y + 48, info.wins[i] > k);
  });

  if (info.timer !== null && info.timer !== undefined) {
    const cx = W / 2, low = info.timer <= 10;
    g.fillStyle = OUT; g.beginPath(); g.roundRect(cx - 36, y - 8, 72, 50, 12); g.fill();
    g.fillStyle = "#4a3b46"; g.beginPath(); g.roundRect(cx - 32, y - 4, 64, 42, 9); g.fill();
    label(g, String(info.timer), cx, y + 18, "center", 28);
    if (low) { g.fillStyle = "rgba(255,77,77,0.35)"; g.beginPath(); g.roundRect(cx - 32, y - 4, 64, 42, 9); g.fill(); }
  } else if (info.scene === "practice") label(g, info.mode === "CPU" ? "PRACTICE" : `Opponent: ${info.mode}`, W / 2, y + 9, "center", 13);

  if (info.banner) drawBanner(g, info.banner);
  const tag = !document.hasFocus() && !info.touch ? "CLICK TO PLAY" : info.slow ? "SLOW MOTION" : "";
  if (tag) {
    g.font = BIG; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = 5; g.strokeStyle = OUT; g.strokeText(tag, W / 2, 100);
    g.fillStyle = "#ffd93b"; g.fillText(tag, W / 2, 100);
  }

  if (info.touch) return; // the on-screen buttons replace the key reminders
  if (info.scene === "practice") footer(g, `T opponent (${info.mode})    1 2 3 CPU level    B stage (${info.stage})    Esc menu`, H - 47);
  footer(g, "A/D walk   W jump   S crouch   J punch (×3 combo)   K kick   L heavy   S+K sweep   I block   U roll   in air: J / K", H - 21);
}
