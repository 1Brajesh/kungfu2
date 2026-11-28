// Menus (title, pause, match over), the logo and the controls card. Keyboard, mouse and touch.
// An item is { label, action } or a choice { label, values, index, onChange(i) }.
import { W, H, OUT, PI } from "./config.js";
import { take } from "./input.js";

const FONT = (px) => `900 ${px}px "Arial Black", Impact, system-ui, sans-serif`;

export function makeMenu(items, opts = {}) {
  return { items, sel: 0, rects: [], ...opts };
}

function change(item, d) {
  item.index = (item.index + d + item.values.length) % item.values.length;
  item.onChange?.(item.index);
}

/** Reads the keyboard; returns the chosen item's action, or null. */
export function menuKeys(m) {
  const n = m.items.length;
  if (take("ArrowUp", "KeyW")) m.sel = (m.sel - 1 + n) % n;
  if (take("ArrowDown", "KeyS")) m.sel = (m.sel + 1) % n;
  const it = m.items[m.sel];
  if (it.values) {
    if (take("ArrowLeft", "KeyA")) change(it, -1);
    if (take("ArrowRight", "KeyD")) change(it, 1);
  }
  if (take("Enter", "Space", "KeyJ")) {
    if (it.values) { change(it, 1); return null; }
    return it.action;
  }
  return null;
}

/** A click or tap at game coords; returns an action, or null. Choices: left half goes back, right half forward. */
export function menuPointer(m, x, y) {
  for (let i = 0; i < m.rects.length; i++) {
    const r = m.rects[i];
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
    m.sel = i;
    const it = m.items[i];
    if (it.values) { change(it, x < r.x + r.w / 2 ? -1 : 1); return null; }
    return it.action;
  }
  return null;
}

function text(g, s, x, y, size, fill, align = "center", stroke = 6) {
  g.font = FONT(size); g.textAlign = align; g.textBaseline = "middle"; g.lineJoin = "round";
  g.lineWidth = stroke; g.strokeStyle = OUT; g.strokeText(s, x, y);
  g.fillStyle = fill; g.fillText(s, x, y);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Draws the menu as a column of buttons centred at cx, starting at y. */
export function drawMenu(g, m, cx, y, wt) {
  const bw = 330, bh = 40, gap = m.gap ?? 10;
  m.rects = [];
  m.items.forEach((it, i) => {
    const x = cx - bw / 2, yy = y + i * (bh + gap), on = i === m.sel;
    m.rects.push({ x, y: yy, w: bw, h: bh });
    const pop = on ? 1 + 0.03 * Math.sin(wt * 6) : 1;
    g.save(); g.translate(cx, yy + bh / 2); g.scale(pop, pop); g.translate(-cx, -(yy + bh / 2));
    roundRect(g, x - 3, yy - 3, bw + 6, bh + 6, 12); g.fillStyle = OUT; g.fill();
    roundRect(g, x, yy, bw, bh, 10); g.fillStyle = on ? "#ffd93b" : "#fff8ec"; g.fill();
    g.fillStyle = on ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.5)"; roundRect(g, x + 4, yy + 3, bw - 8, bh * 0.38, 7); g.fill();
    g.font = FONT(it.values ? 15 : 19); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = OUT;
    if (it.values) {
      g.textAlign = "left"; g.fillText(it.label, x + 16, yy + bh / 2 + 1);
      g.textAlign = "right"; g.fillText(`◀  ${it.values[it.index]}  ▶`, x + bw - 14, yy + bh / 2 + 1);
    } else g.fillText(it.label, cx, yy + bh / 2 + 1);
    g.restore();
  });
}

/** Dark see-through panel behind a menu. */
export function dim(g, a = 0.45) { g.fillStyle = `rgba(23,18,29,${a})`; g.fillRect(0, 0, W, H); }

/** The title: KUNG FU in comic letters with a big red 2, bobbing a little. */
export function drawLogo(g, cx, cy, wt) {
  g.save(); g.translate(cx, cy + Math.sin(wt * 1.6) * 3); g.rotate(-0.04);
  g.font = FONT(92); g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
  // KUNG FU and the badge are centred together
  const tw = g.measureText("KUNG FU").width, gap = 14, R = 62, tx = -(gap + 2 * R) / 2;
  g.lineWidth = 22; g.strokeStyle = OUT; g.strokeText("KUNG FU", tx, 0);
  g.fillStyle = "#c0392b"; g.fillText("KUNG FU", tx, 6);
  g.fillStyle = "#ffd93b"; g.fillText("KUNG FU", tx, 0);
  // the 2 in a red burst
  const bx = tx + tw / 2 + gap + R - 6, by = -4;
  g.save(); g.translate(bx, by); g.rotate(wt * 0.4);
  g.beginPath();
  for (let i = 0; i < 24; i++) { const r = i % 2 ? 46 : 62, a = (i * PI) / 12; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fillStyle = "#e23a3f"; g.fill(); g.lineWidth = 6; g.strokeStyle = OUT; g.stroke();
  g.restore();
  g.font = FONT(80); g.lineWidth = 14; g.strokeText("2", bx, by + 4); g.fillStyle = "#fff8ec"; g.fillText("2", bx, by + 4);
  g.restore();
  text(g, "A fighting game drawn entirely in code", cx, cy + 66, 15, "#fff8ec", "center", 5);
}

const CONTROLS = [
  ["Walk", "A / D  or  ← / →"], ["Jump", "W  or  ↑"], ["Crouch (ducks punches)", "S  or  ↓"],
  ["Punch, press again for a combo", "J"], ["Kick", "K"], ["Heavy kick (knocks down)", "L"],
  ["Sweep (gets past a block)", "S + K"], ["Block (wears down your guard)", "I  (hold)"],
  ["Roll (through them if you hold toward)", "U"], ["In the air: flying kick / down smash", "K / J"],
  ["Pause", "Esc  or  P"],
];

/** The controls card, shown from the title menu. */
export function drawControls(g) {
  dim(g, 0.6);
  const x = 170, y = 70, w = 620, h = 400;
  roundRect(g, x - 4, y - 4, w + 8, h + 8, 18); g.fillStyle = OUT; g.fill();
  roundRect(g, x, y, w, h, 14); g.fillStyle = "#fff8ec"; g.fill();
  text(g, "CONTROLS", W / 2, y + 34, 30, "#ffd93b", "center", 8);
  g.font = '600 16px system-ui, -apple-system, sans-serif'; g.textBaseline = "middle";
  CONTROLS.forEach(([what, keys], i) => {
    const yy = y + 78 + i * 27;
    g.fillStyle = OUT; g.textAlign = "left"; g.fillText(what, x + 36, yy);
    g.font = FONT(15); g.textAlign = "right"; g.fillText(keys, x + w - 36, yy);
    g.font = '600 16px system-ui, -apple-system, sans-serif';
  });
  g.font = '600 13px system-ui, -apple-system, sans-serif'; g.textAlign = "center"; g.fillStyle = "#6b5f70";
  g.fillText("Press any key or click to go back", W / 2, y + h - 18);
}

export { text as drawText };
