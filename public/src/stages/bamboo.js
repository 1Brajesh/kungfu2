// Stage 2: a misty bamboo forest. Three depths of bamboo sway in the wind, with gusts every few
// seconds; sunbeams pulse, mist drifts, leaves fall, and big hits shake the stalks loose of leaves.
import { W, H, GROUND, PI, OUT, time } from "../config.js";
import { mulberry, quad, wobble, tumbleFlake } from "./common.js";

const rnd = mulberry(21);
/** One layer of stalks: x, width, height, sway phase, how many leaf clusters. */
function layer(n, x0, x1, w0, w1, h0, h1) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + ((x1 - x0) * (i + rnd() * 0.8)) / n, w: w0 + rnd() * (w1 - w0), h: h0 + rnd() * (h1 - h0), ph: rnd() * 6, lv: rnd() });
  return out;
}
const FAR = layer(26, -20, W + 20, 6, 9, 380, 470);
const MID = layer(14, -20, W + 20, 11, 15, 470, 560);
const NEAR = layer(7, -30, W + 30, 17, 22, 520, 620);
const EDGE = [{ x: 22, w: 26, h: 640, ph: 0.7, lv: 0.6 }, { x: 945, w: 24, h: 640, ph: 2.1, lv: 0.3 }];
const STONES = [[140, 470, 16], [178, 476, 9], [760, 466, 13], [805, 480, 18], [470, 500, 8], [320, 520, 11], [640, 528, 10]];

let gust = 0, gustT = 4, gustDur = 3;
const shake = wobble(22, 2.5);

/** How far a stalk's tip leans, for its depth (k) and phase. */
const lean = (s, k) => (Math.sin(time.wt * 0.9 + s.ph) * 6 + Math.sin(time.wt * 2.1 + s.ph * 2) * 2 + gust * 26 + shake.x * 20 * Math.sin(s.ph * 5)) * k;

function stalk(g, s, baseY, col, node, leaf, k, outline = false) {
  const top = [s.x + lean(s, k), baseY - s.h], ctl = [s.x, baseY - s.h * 0.55], base = [s.x, baseY];
  const path = () => { g.beginPath(); g.moveTo(base[0], base[1]); g.quadraticCurveTo(ctl[0], ctl[1], top[0], top[1]); };
  g.lineCap = "butt";
  if (outline) { g.strokeStyle = OUT; g.lineWidth = s.w + 4; path(); g.stroke(); }
  g.strokeStyle = col; g.lineWidth = s.w; path(); g.stroke();
  // lighter stripe down one side
  g.strokeStyle = "rgba(255,255,255,0.13)"; g.lineWidth = s.w * 0.3;
  g.beginPath(); g.moveTo(base[0] - s.w * 0.2, base[1]); g.quadraticCurveTo(ctl[0] - s.w * 0.2, ctl[1], top[0] - s.w * 0.2, top[1]); g.stroke();
  // joints
  g.strokeStyle = node; g.lineWidth = 2.5;
  const segs = 7;
  for (let i = 1; i < segs; i++) {
    const t = i / segs + (s.ph % 0.05), p = quad(base, ctl, top, t);
    g.beginPath(); g.moveTo(p[0] - s.w / 2 - 1, p[1]); g.lineTo(p[0] + s.w / 2 + 1, p[1]); g.stroke();
  }
  // leaf sprays from a few joints
  const n = 2 + Math.floor(s.lv * 3);
  for (let j = 0; j < n; j++) {
    const t = 0.35 + j * 0.13 + s.lv * 0.05, p = quad(base, ctl, top, Math.min(0.95, t));
    const side = (j + Math.floor(s.lv * 10)) % 2 ? 1 : -1;
    for (let q = 0; q < 3; q++) {
      const a = side * (0.9 + q * 0.35) + Math.sin(time.wt * 2 + s.ph + j) * 0.12 + (gust * 0.4 + shake.x * 0.6) * k, len = (16 + q * 5) * (0.6 + 0.6 * k);
      g.save(); g.translate(p[0], p[1]); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -len * 0.16 * side, len, 0); g.quadraticCurveTo(len * 0.45, len * 0.12 * side, 0, 0);
      if (outline) { g.strokeStyle = OUT; g.lineWidth = 2; g.stroke(); }
      g.fillStyle = leaf; g.fill();
      g.restore();
    }
  }
}

const leaves = [];
for (let i = 0; i < 22; i++) leaves.push({ x: Math.random() * W, y: Math.random() * H, vx: -10, vy: 30 + Math.random() * 25, r: Math.random() * 6, vr: (Math.random() - 0.5) * 3, s: 3 + Math.random() * 2.5, c: i % 3 });
let burst = [];
const LEAF_COL = ["#9cc95a", "#c9d86a", "#7fb04c"];
const fog = [{ x: 100, y: 395, w: 260, v: 9 }, { x: 600, y: 415, w: 320, v: 6 }, { x: 900, y: 380, w: 220, v: 11 }];

export const bamboo = {
  id: "bamboo", name: "Bamboo forest",
  tint: [0.94, 1.0, 0.92], shadow: "rgba(40,60,20,0.28)", dust: ["#efe6cf", "#b8a274"],
  update(dt) {
    // gusts: ramp up, hold, ease off, then wait a while for the next
    gustT -= dt;
    if (gustT <= 0 && gustT > -gustDur) { const u = -gustT / gustDur; gust = Math.sin(PI * u); }
    else if (gustT <= -gustDur) { gust = 0; gustT = 5 + Math.random() * 6; gustDur = 2.5 + Math.random() * 2; }
    shake.update(dt);
    for (const p of leaves) {
      p.x += (p.vx - gust * 90 + Math.sin(time.wt * 1.1 + p.r * 2) * 18) * dt; p.y += p.vy * dt; p.r += p.vr * (1 + gust) * dt;
      if (p.y > H + 10 || p.x < -20) { p.y = -10 - Math.random() * 60; p.x = Math.random() * (W + 160); }
    }
    for (const p of burst) { p.life -= dt; p.vy = Math.min(55, p.vy + 110 * dt); p.vx += (-gust * 80 - p.vx) * 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; }
    burst = burst.filter((p) => p.life > 0 && p.y < H + 10);
  },
  impact(x, y, pow) {
    if (pow < 1.3) return;
    shake.kick(pow * 1.6);
    for (let i = 0; i < 6 + pow * 6; i++) {
      burst.push({ x: x + (Math.random() - 0.5) * 500, y: -10 + Math.random() * 120, vx: (Math.random() - 0.5) * 80, vy: 10 + Math.random() * 30, r: Math.random() * 6, vr: (Math.random() - 0.5) * 6, s: 3 + Math.random() * 2.5, c: i % 3, life: 6 });
    }
  },
  back(g) {
    const wt = time.wt;
    let gr = g.createLinearGradient(0, 0, 0, GROUND);
    gr.addColorStop(0, "#d9edc0"); gr.addColorStop(1, "#f3f7dc");
    g.fillStyle = gr; g.fillRect(-40, -40, W + 80, H + 80);
    // sunbeams
    for (const [x, w, ph] of [[250, 90, 0], [520, 60, 2], [700, 120, 4]]) {
      g.fillStyle = `rgba(255,252,215,${0.22 + 0.1 * Math.sin(wt * 0.6 + ph)})`;
      g.beginPath(); g.moveTo(x, -20); g.lineTo(x + w, -20); g.lineTo(x + w + 170, GROUND); g.lineTo(x + 140, GROUND); g.closePath(); g.fill();
    }
    for (const s of FAR) stalk(g, s, GROUND - 40, "#b9d9a0", "#a3c98a", "#a9d090", 0.5);
    g.fillStyle = "rgba(243,247,220,0.45)"; g.fillRect(-40, 0, W + 80, GROUND);
    for (const s of MID) stalk(g, s, GROUND - 14, "#7cba68", "#5f9d50", "#6fb05a", 0.8);
    // mist
    for (const f of fog) {
      const x = ((f.x + wt * f.v) % (W + f.w * 2)) - f.w;
      g.fillStyle = "rgba(255,255,245,0.35)"; g.beginPath(); g.ellipse(x, f.y, f.w, 22, 0, 0, PI * 2); g.fill();
    }
    for (const s of NEAR) stalk(g, s, GROUND + 4, "#4f9a4c", "#3b7d3b", "#4c9446", 1);
    // ground: a dirt path with moss along the back edge
    g.fillStyle = "#cdb88a"; g.fillRect(-40, GROUND, W + 80, H - GROUND + 40);
    g.fillStyle = "#b9a374";
    for (let i = 0; i < 40; i++) { const x = (i * 97) % (W + 40) - 20, y = GROUND + 12 + ((i * 53) % 80); g.beginPath(); g.ellipse(x, y, 10 + (i % 4) * 4, 2.2, 0, 0, PI * 2); g.fill(); }
    g.fillStyle = "#86b85f"; g.fillRect(-40, GROUND - 2, W + 80, 8);
    g.fillStyle = "#6a9c4a";
    for (let x = -20; x < W + 20; x += 23) {
      const sw = Math.sin(wt * 2 + x) * 2 + gust * 4;
      g.beginPath(); g.moveTo(x, GROUND + 6); g.lineTo(x + 4 + sw, GROUND - 9 - (x % 5)); g.lineTo(x + 8, GROUND + 6); g.closePath(); g.fill();
    }
    for (const [x, y, r] of STONES) {
      g.fillStyle = "#9a9077"; g.beginPath(); g.ellipse(x, y + 2, r, r * 0.55, 0, 0, PI * 2); g.fill();
      g.fillStyle = "#b5ab90"; g.beginPath(); g.ellipse(x - r * 0.15, y, r * 0.85, r * 0.45, 0, 0, PI * 2); g.fill();
    }
  },
  front(g) {
    for (const s of EDGE) stalk(g, s, H + 20, "#3f8a45", "#2d6b33", "#3d8740", 0.7, true);
    for (const p of leaves) tumbleFlake(g, p, LEAF_COL[p.c], p.s, p.s * 0.4);
    for (const p of burst) tumbleFlake(g, p, LEAF_COL[p.c], p.s, p.s * 0.4);
  },
};
