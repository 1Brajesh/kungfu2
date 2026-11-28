// Stage 3: a temple rooftop at night. Stars twinkle, clouds cross the moon, city windows switch on
// and off, fireworks go up in the distance, a string of lanterns sways, and fireflies drift.
import { W, H, GROUND, PI, time } from "../config.js";
import { circlePath, lineXY } from "../draw.js";
import { mulberry, cloud, quad, wobble } from "./common.js";

const rnd = mulberry(77);
const STARS = Array.from({ length: 90 }, () => ({ x: rnd() * W, y: rnd() * 300, r: 0.6 + rnd() * 1.4, ph: rnd() * 6, sp: 1 + rnd() * 2 }));
const MOON = [720, 120, 56];
const NIGHT_CLOUDS = [{ x: 0, y: 140, s: 1.1, v: 7 }, { x: 520, y: 95, s: 0.8, v: 5 }, { x: 900, y: 175, s: 1.3, v: 9 }];

/** Skyline: buildings with a flat or pagoda roof, and a grid of windows each lit or not. */
function skyline(seed, base, hMin, hMax) {
  const r = mulberry(seed), out = [];
  let x = -30;
  while (x < W + 30) {
    const w = 50 + r() * 70, h = hMin + r() * (hMax - hMin), pagoda = r() < 0.35, wins = [];
    for (let wy = base - h + 14; wy < base - 12; wy += 16) for (let wx = x + 8; wx < x + w - 10; wx += 14) wins.push({ x: wx, y: wy, on: r() < 0.35 });
    out.push({ x, w, h, pagoda, wins });
    x += w + 4 + r() * 20;
  }
  return out;
}
const FAR_CITY = skyline(3, 360, 60, 150), NEAR_CITY = skyline(8, 400, 40, 110);
function drawCity(g, city, base, col, roofCol, winAlpha) {
  for (const b of city) {
    g.fillStyle = col; g.fillRect(b.x, base - b.h, b.w, b.h + 60);
    if (b.pagoda) {
      g.fillStyle = roofCol;
      g.beginPath(); g.moveTo(b.x - 14, base - b.h + 4); g.quadraticCurveTo(b.x + 6, base - b.h, b.x + 14, base - b.h - 20);
      g.lineTo(b.x + b.w - 14, base - b.h - 20); g.quadraticCurveTo(b.x + b.w - 6, base - b.h, b.x + b.w + 14, base - b.h + 4); g.closePath(); g.fill();
    }
    for (const w of b.wins) if (w.on) { g.fillStyle = `rgba(255,210,122,${winAlpha})`; g.fillRect(w.x, w.y, 7, 9); }
  }
}

// --- fireworks ---
let rockets = [], sparks = [], nextFw = 2;
const FW_COLS = ["#ff6b8b", "#ffd36b", "#7be0ff", "#b58bff", "#8cff9e"];
function launch() {
  rockets.push({ x: 80 + Math.random() * 800, y: 380, vy: -300 - Math.random() * 90, top: 60 + Math.random() * 100, col: FW_COLS[Math.floor(Math.random() * FW_COLS.length)] });
}

// --- lanterns on a rope across the top ---
const ROPE = [[-30, 128], [480, 236], [990, 128]];
const swing = wobble(9, 0.9);
const fireflies = Array.from({ length: 12 }, (_, i) => ({ x: Math.random() * W, y: 250 + Math.random() * 170, ph: i * 1.3, sp: 0.3 + Math.random() * 0.5 }));
let shoot = null, nextShoot = 5;

export const rooftop = {
  id: "rooftop", name: "Rooftop at night",
  tint: [0.7, 0.75, 0.98], shadow: "rgba(8,4,30,0.4)", dust: ["#b9b6d6", "#6f6b96"],
  update(dt) {
    swing.update(dt);
    if ((nextFw -= dt) <= 0) { launch(); nextFw = 1.5 + Math.random() * 4; }
    for (const r of rockets) {
      r.y += r.vy * dt; r.vy += 60 * dt;
      if (r.y <= r.top) {
        r.done = true;
        const n = 44;
        for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2, sp = 130 + Math.random() * 50; sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.6, col: r.col }); }
        sparks.push({ glow: true, x: r.x, y: r.y, life: 0.5, col: r.col });
      }
    }
    rockets = rockets.filter((r) => !r.done);
    for (const s of sparks) { s.life -= dt; if (s.glow) continue; s.vx *= Math.exp(-1.6 * dt); s.vy = s.vy * Math.exp(-1.6 * dt) + 30 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    sparks = sparks.filter((s) => s.life > 0);
    // windows switch on and off now and then
    for (const c of [FAR_CITY, NEAR_CITY]) for (const b of c) for (const w of b.wins) if (Math.random() < dt * 0.02) w.on = !w.on;
    if ((nextShoot -= dt) <= 0) { shoot = { x: 100 + Math.random() * 500, y: 30 + Math.random() * 80, t: 0 }; nextShoot = 7 + Math.random() * 9; }
    if (shoot && (shoot.t += dt) > 0.7) shoot = null;
  },
  impact(x, y, pow) { if (pow >= 1.3) swing.kick(pow * (x < 480 ? 0.6 : -0.6)); },
  back(g) {
    const wt = time.wt;
    let gr = g.createLinearGradient(0, 0, 0, GROUND);
    gr.addColorStop(0, "#15123a"); gr.addColorStop(0.6, "#2f2a66"); gr.addColorStop(1, "#5d4a86");
    g.fillStyle = gr; g.fillRect(-40, -40, W + 80, H + 80);
    for (const s of STARS) { g.fillStyle = `rgba(255,250,230,${0.45 + 0.45 * Math.sin(wt * s.sp + s.ph)})`; circlePath(g, [s.x, s.y], s.r); g.fill(); }
    if (shoot) {
      const u = shoot.t / 0.7, x = shoot.x + u * 260, y = shoot.y + u * 90;
      g.strokeStyle = `rgba(255,255,240,${1 - u})`; g.lineWidth = 2; g.lineCap = "round"; lineXY(g, x - 60, y - 21, x, y);
    }
    // moon
    const [mx, my, mr] = MOON;
    g.fillStyle = "rgba(255,240,200,0.12)"; circlePath(g, [mx, my], mr * 1.9); g.fill();
    g.fillStyle = "rgba(255,240,200,0.18)"; circlePath(g, [mx, my], mr * 1.35); g.fill();
    g.fillStyle = "#fff4cf"; circlePath(g, [mx, my], mr); g.fill();
    g.fillStyle = "#ecdcae";
    for (const [cx, cy, cr] of [[-18, -14, 11], [16, 10, 8], [-6, 22, 6], [22, -20, 5]]) { circlePath(g, [mx + cx, my + cy], cr); g.fill(); }
    for (const c of NIGHT_CLOUDS) cloud(g, ((c.x + wt * c.v) % (W + 300)) - 150, c.y, c.s, "#47417f", "#3a3570");
    // fireworks, behind the city
    g.lineCap = "round";
    for (const r of rockets) { g.strokeStyle = "rgba(255,230,180,0.8)"; g.lineWidth = 2; lineXY(g, r.x, r.y, r.x, r.y + 16); }
    g.globalCompositeOperation = "lighter";
    for (const s of sparks) {
      if (s.glow) { g.globalAlpha = s.life * 0.5; g.fillStyle = s.col; circlePath(g, [s.x, s.y], 70 * (1.2 - s.life)); g.fill(); continue; }
      const a = Math.min(1, s.life / 0.7);
      g.strokeStyle = s.col; g.globalAlpha = a; g.lineWidth = 3;
      lineXY(g, s.x - s.vx * 0.08, s.y - s.vy * 0.08, s.x, s.y);
      g.fillStyle = "#fff"; circlePath(g, [s.x, s.y], 1.4); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    drawCity(g, FAR_CITY, 360, "#2a2456", "#231e4a", 0.55);
    drawCity(g, NEAR_CITY, 400, "#1d1840", "#171334", 0.85);
    // haze over the city
    gr = g.createLinearGradient(0, 300, 0, GROUND);
    gr.addColorStop(0, "rgba(93,74,134,0)"); gr.addColorStop(1, "rgba(93,74,134,0.45)");
    g.fillStyle = gr; g.fillRect(-40, 300, W + 80, GROUND - 300);
    // the roof we fight on: a ridge cap with curled ends, tiles falling away below
    g.fillStyle = "#3a3556"; g.fillRect(-40, GROUND, W + 80, H - GROUND + 40);
    for (let row = 0; row < 6; row++) {
      const y = GROUND + 16 + row * (12 + row * 3), r = 9 + row * 2;
      g.fillStyle = row % 2 ? "#332f4d" : "#2e2a46";
      g.fillRect(-40, y - 4, W + 80, r + 6);
      g.strokeStyle = "#4b4670"; g.lineWidth = 2;
      for (let x = -40 + (row % 2) * r; x < W + 40; x += r * 2) { g.beginPath(); g.arc(x, y, r, 0, PI); g.stroke(); }
    }
    g.fillStyle = "#24203a"; g.fillRect(-40, GROUND + 6, W + 80, 6);
    g.fillStyle = "#57527c"; g.fillRect(-40, GROUND - 4, W + 80, 11);
    g.fillStyle = "#6f6a98"; g.fillRect(-40, GROUND - 4, W + 80, 3);
    for (const [x, d] of [[34, 1], [926, -1]]) {
      g.save(); g.translate(x, GROUND); g.scale(d, 1);
      g.strokeStyle = "#57527c"; g.lineWidth = 11; g.lineCap = "round";
      g.beginPath(); g.moveTo(30, 0); g.quadraticCurveTo(-6, -4, -10, -30); g.quadraticCurveTo(-12, -52, 6, -50); g.quadraticCurveTo(16, -48, 10, -38); g.stroke();
      g.restore();
    }
  },
  front(g) {
    const wt = time.wt;
    // rope and lanterns
    g.strokeStyle = "#1a1530"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ROPE[0][0], ROPE[0][1]); g.quadraticCurveTo(ROPE[1][0], ROPE[1][1], ROPE[2][0], ROPE[2][1]); g.stroke();
    for (let i = 1; i < 10; i++) {
      const p = quad(ROPE[0], ROPE[1], ROPE[2], i / 10);
      g.save(); g.translate(p[0], p[1]); g.rotate(Math.sin(wt * 1.2 + i) * 0.08 + swing.x * (1 - Math.abs(i - 5) / 6));
      g.strokeStyle = "#1a1530"; g.lineWidth = 1.5; lineXY(g, 0, 0, 0, 10);
      const glow = 0.22 + 0.06 * Math.sin(wt * 3 + i * 2);
      g.fillStyle = `rgba(255,170,90,${glow})`; circlePath(g, [0, 22], 24); g.fill();
      g.fillStyle = i % 3 ? "#ff6a4a" : "#ffb347"; g.beginPath(); g.ellipse(0, 22, 9, 11, 0, 0, PI * 2); g.fill();
      g.fillStyle = "rgba(255,240,200,0.5)"; g.beginPath(); g.ellipse(-2.5, 20, 3, 6, 0, 0, PI * 2); g.fill();
      g.fillStyle = "#2a2240"; g.fillRect(-5, 10, 10, 3); g.fillRect(-5, 31, 10, 3);
      g.restore();
    }
    for (const f of fireflies) {
      const x = f.x + Math.sin(wt * f.sp + f.ph) * 40, y = f.y + Math.sin(wt * f.sp * 1.7 + f.ph * 2) * 18, a = 0.5 + 0.5 * Math.sin(wt * 3 + f.ph * 3);
      g.fillStyle = `rgba(255,240,140,${0.2 * a})`; circlePath(g, [x, y], 7); g.fill();
      g.fillStyle = `rgba(255,250,190,${a})`; circlePath(g, [x, y], 1.8); g.fill();
    }
  },
};
