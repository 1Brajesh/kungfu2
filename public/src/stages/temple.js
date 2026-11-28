// Stage 1: the temple courtyard on a sunny day. Clouds drift, trees and lanterns sway, petals fall,
// and birds sitting on the roof fly off at a big hit and come back later.
import { W, H, GROUND, PI, OUT, time } from "../config.js";
import { circlePath, lineXY } from "../draw.js";
import { makeRidge, fillRidge, cloud, wobble, tumbleFlake } from "./common.js";

const T1 = makeRidge(5, 300, 70), T2 = makeRidge(9, 330, 40);
const CLOUDS = [{ x: 100, y: 70, s: 1, v: 8 }, { x: 420, y: 115, s: 0.8, v: 6 }, { x: 700, y: 60, s: 1.2, v: 10 }, { x: 1000, y: 125, s: 0.9, v: 7 }];
const lanternSwing = wobble(14, 1.2), treeShake = wobble(40, 4);

function roof(g, cx, by, w, h) {
  const l = cx - w / 2, r = cx + w / 2;
  g.fillStyle = "#3d8a68";
  g.beginPath(); g.moveTo(l - 18, by - 12); g.quadraticCurveTo(l + 20, by - 4, l + 50, by - h);
  g.lineTo(r - 50, by - h); g.quadraticCurveTo(r - 20, by - 4, r + 18, by - 12);
  g.lineTo(r + 6, by + 2); g.lineTo(l - 6, by + 2); g.closePath(); g.fill();
  g.strokeStyle = "#2c6a4f"; g.lineWidth = 2;
  for (let x = l + 56; x < r - 50; x += 16) lineXY(g, x, by - h + 3, x + (x - cx) * 0.08, by - 5);
  g.fillStyle = "#2c6a4f"; g.fillRect(l - 4, by - 4, w + 8, 6); g.fillRect(l + 46, by - h - 5, w - 92, 6);
}
function lantern(g, x, y) {
  g.save(); g.translate(x, y); g.rotate(Math.sin(time.wt * 1.4 + x) * 0.07 + lanternSwing.x * (x < 480 ? 1 : -0.8));
  g.strokeStyle = "#5a3a2a"; g.lineWidth = 2; lineXY(g, 0, 0, 0, 18);
  g.fillStyle = "rgba(255,200,120,0.28)"; circlePath(g, [0, 36], 30); g.fill();
  g.fillStyle = "#e5473b"; g.beginPath(); g.ellipse(0, 36, 15, 18, 0, 0, PI * 2); g.fill();
  g.fillStyle = "#c2362c"; g.beginPath(); g.ellipse(5, 36, 7, 18, 0, 0, PI * 2); g.fill();
  g.fillStyle = "#f2c14e"; g.fillRect(-8, 16, 16, 4); g.fillRect(-8, 52, 16, 4);
  g.strokeStyle = "#f2c14e"; lineXY(g, 0, 56, 0, 68);
  g.restore();
}
function cherry(g, x, flip) {
  g.save(); g.translate(x, 0); g.scale(flip, 1);
  g.strokeStyle = "#7b4a32"; g.lineCap = "round";
  g.lineWidth = 18; g.beginPath(); g.moveTo(0, GROUND); g.quadraticCurveTo(10, 340, 45, 262); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.moveTo(14, 335); g.quadraticCurveTo(-20, 300, -40, 262); g.stroke();
  const sw = Math.sin(time.wt * 0.8) * 2 + treeShake.x * 6;
  const blobs = [[45, 230, 52], [-30, 250, 40], [5, 200, 44], [80, 262, 38], [-50, 215, 30], [20, 265, 36]];
  g.fillStyle = "#f28db3"; for (const b of blobs) { circlePath(g, [b[0] + sw, b[1] + 6], b[2]); g.fill(); }
  g.fillStyle = "#ffb8d2"; for (const b of blobs) { circlePath(g, [b[0] + sw, b[1]], b[2] * 0.92); g.fill(); }
  g.restore();
}

// --- birds on the top roof ridge ---
const PERCH_Y = 124;
const birds = [355, 392, 572, 604].map((x, i) => ({ px: x, x, y: PERCH_Y, st: "perch", t: 0, vx: 0, vy: 0, face: i % 2 ? -1 : 1, ph: i * 1.7, from: null }));
function scareBirds() {
  for (const b of birds) {
    if (b.st !== "perch") continue;
    b.st = "fly"; b.t = 0;
    b.vx = (b.px < 480 ? -1 : 1) * (110 + Math.random() * 90); b.vy = -(90 + Math.random() * 70);
    b.face = Math.sign(b.vx);
  }
}
function updateBirds(dt) {
  for (const b of birds) {
    b.t += dt;
    if (b.st === "fly") {
      b.vy -= 40 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.t > 5 + Math.random() * 0.02 * b.px) {
        b.st = "back"; b.t = 0; b.from = [b.px < 480 ? -30 : W + 30, 60 + Math.random() * 40]; b.face = b.px < 480 ? 1 : -1;
      }
    } else if (b.st === "back") {
      const u = Math.min(1, b.t / 2.6), e = 1 - Math.pow(1 - u, 2);
      b.x = b.from[0] + (b.px - b.from[0]) * e; b.y = b.from[1] + (PERCH_Y - b.from[1]) * e - Math.sin(PI * u) * 30;
      if (u >= 1) { b.st = "perch"; b.x = b.px; b.y = PERCH_Y; b.t = 0; }
    }
  }
}
function drawBird(g, b) {
  g.save(); g.translate(b.x, b.y); g.scale(b.face, 1);
  const flying = b.st !== "perch";
  const peck = !flying && Math.sin(time.wt * 1.3 + b.ph) > 0.93 ? 1 : 0;
  g.fillStyle = OUT;
  if (flying) {
    const f = Math.sin(time.wt * 22 + b.ph);
    g.strokeStyle = "#4a4458"; g.lineWidth = 2.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(-1, -6); g.quadraticCurveTo(-6, -12 - f * 7, -12, -8 - f * 10); g.stroke();
  }
  g.fillStyle = "#4a4458"; g.beginPath(); g.ellipse(0, -5, 6.5, 4.5, 0, 0, PI * 2); g.fill();
  g.beginPath(); g.moveTo(-5, -6); g.lineTo(-11, -9); g.lineTo(-10, -4); g.closePath(); g.fill();
  const hx = 5, hy = -9 + peck * 4;
  circlePath(g, [hx, hy], 3.6); g.fill();
  g.fillStyle = "#f2a33a"; g.beginPath(); g.moveTo(hx + 3, hy - 1); g.lineTo(hx + 7, hy + 0.5); g.lineTo(hx + 3, hy + 1.5); g.closePath(); g.fill();
  g.fillStyle = "#fff"; circlePath(g, [hx + 1.2, hy - 1], 1.1); g.fill();
  if (!flying) { g.strokeStyle = "#f2a33a"; g.lineWidth = 1.2; lineXY(g, -1, -1, -1, 0); lineXY(g, 2, -1, 2, 0); }
  else {
    const f = Math.sin(time.wt * 22 + b.ph);
    g.strokeStyle = "#5c5670"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(1, -6); g.quadraticCurveTo(-3, -13 - f * 7, -8, -10 - f * 11); g.stroke();
  }
  g.restore();
}

// --- petals: a steady drift, plus a puff from the trees on big hits ---
const petals = [];
for (let i = 0; i < 34; i++) petals.push({ x: Math.random() * W, y: Math.random() * H, vx: -20 - Math.random() * 30, vy: 25 + Math.random() * 30, r: Math.random() * 6, vr: (Math.random() - 0.5) * 3, s: 2 + Math.random() * 2.5 });
let burst = [];

export const temple = {
  id: "temple", name: "Temple courtyard",
  tint: null, shadow: "rgba(90,60,30,0.25)", dust: ["#f7eedb", "#c8ad80"],
  update(dt) {
    lanternSwing.update(dt); treeShake.update(dt); updateBirds(dt);
    for (const p of petals) {
      p.x += (p.vx + Math.sin(time.wt * 1.3 + p.r * 3) * 20) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > H + 10 || p.x < -10) { p.y = -10 - Math.random() * 40; p.x = Math.random() * (W + 100); }
    }
    for (const p of burst) { p.life -= dt; p.vy = Math.min(60, p.vy + 120 * dt); p.vx *= Math.exp(-1.5 * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; }
    burst = burst.filter((p) => p.life > 0 && p.y < H + 10);
  },
  impact(x, y, pow) {
    if (pow >= 1.5) { scareBirds(); lanternSwing.kick(pow * 0.5); treeShake.kick(pow * 2); }
    if (pow >= 1.5) {
      for (const tx of [130, 830]) for (let i = 0; i < 6 + pow * 3; i++) {
        burst.push({ x: tx + (Math.random() - 0.5) * 120, y: 200 + Math.random() * 80, vx: (Math.random() - 0.5) * 120, vy: -20 + Math.random() * 40, r: Math.random() * 6, vr: (Math.random() - 0.5) * 6, s: 2 + Math.random() * 2.5, life: 4 });
      }
    }
  },
  back(g) {
    const wt = time.wt;
    let gr = g.createLinearGradient(0, 0, 0, GROUND);
    gr.addColorStop(0, "#5fb8f5"); gr.addColorStop(1, "#d3efff");
    g.fillStyle = gr; g.fillRect(-40, -40, W + 80, H + 80);
    g.fillStyle = "rgba(255,245,190,0.5)"; circlePath(g, [820, 90], 58); g.fill();
    g.fillStyle = "#fff3b0"; circlePath(g, [820, 90], 38); g.fill();
    for (const c of CLOUDS) cloud(g, ((c.x + wt * c.v) % (W + 300)) - 150, c.y, c.s);
    fillRidge(g, T1, "#a9c8ec"); fillRidge(g, T2, "#9fd08f");
    // temple
    g.fillStyle = "#d8c39a"; g.fillRect(190, 425, 580, 15);
    g.fillStyle = "#f4e7cf"; g.fillRect(215, 262, 530, 163);
    g.fillStyle = "#7a3b22"; g.fillRect(425, 305, 110, 120);
    g.fillStyle = "#5e2c18"; g.fillRect(478, 305, 4, 120);
    g.fillStyle = "#f2c14e";
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { circlePath(g, [440 + c * 13, 325 + r * 26], 2.4); g.fill(); circlePath(g, [494 + c * 13, 325 + r * 26], 2.4); g.fill(); }
    for (const wx of [275, 605]) {
      g.fillStyle = "#9a5530"; g.fillRect(wx, 300, 80, 62);
      g.strokeStyle = "#f4e7cf"; g.lineWidth = 2;
      for (let i = 1; i < 4; i++) { lineXY(g, wx + i * 20, 300, wx + i * 20, 362); lineXY(g, wx, 300 + i * 15.5, wx + 80, 300 + i * 15.5); }
    }
    for (const px of [222, 372, 566, 716]) { g.fillStyle = "#cf3f31"; g.fillRect(px, 262, 22, 163); g.fillStyle = "#a8322a"; g.fillRect(px + 15, 262, 7, 163); }
    g.fillStyle = "#f4e7cf"; g.fillRect(340, 168, 280, 40);
    g.fillStyle = "#c0392b"; g.fillRect(330, 196, 300, 10); g.fillRect(195, 248, 570, 16);
    roof(g, 480, 248, 640, 44);
    roof(g, 480, 170, 400, 40);
    for (const b of birds) drawBird(g, b);
    lantern(g, 300, 264); lantern(g, 660, 264);
    cherry(g, 100, 1); cherry(g, 860, -1);
    // courtyard
    g.fillStyle = "#e9d7b1"; g.fillRect(-40, GROUND, W + 80, H - GROUND + 40);
    g.strokeStyle = "#d4bd91"; g.lineWidth = 2;
    for (const d of [10, 24, 42, 66, 96]) lineXY(g, -40, GROUND + d, W + 40, GROUND + d);
    const vy = GROUND - 150;
    for (let i = -10; i <= 10; i++) { const xb = 480 + i * 80, t = (H + 40 - vy) / (GROUND - vy); lineXY(g, xb, GROUND, 480 + (xb - 480) * t, H + 40); }
    g.fillStyle = "#cdb68a"; g.fillRect(-40, GROUND, W + 80, 3);
  },
  front(g) {
    for (const p of petals) tumbleFlake(g, p, "#ffc2d8", p.s, p.s * 0.55);
    for (const p of burst) tumbleFlake(g, p, "#ffb3cf", p.s, p.s * 0.55);
  },
};
