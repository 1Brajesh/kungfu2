// Hit effects (comic star, word, flying bits) and motion streaks.
import { PI, OUT, time } from "./config.js";
import { circlePath, lineXY } from "./draw.js";

let parts = [];

export function spawnHit(x, y, pow, kind = "hit") {
  const blk = kind === "block";
  parts.push({ t: "star", x, y, life: 0.24, max: 0.24, r: 28 * pow, blk });
  parts.push({ t: "word", x: x + 18, y: y - 50, life: 0.7, max: 0.7, text: blk ? "BLOCK!" : pow >= 2 ? "WHAM!" : "POW!", blk });
  for (let i = 0; i < 8; i++) {
    const a = (Math.random() - 0.5) * 2.6, sp = 200 + Math.random() * 350;
    parts.push({ t: "bit", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, life: 0.35, max: 0.35, r: 2 + Math.random() * 3 });
  }
}

export function updateFx(dt) {
  for (const p of parts) {
    p.life -= dt;
    if (p.vx !== undefined) { p.vy += 1200 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  parts = parts.filter((p) => p.life > 0);
}

function starPath(g, x, y, ro, ri, n, rot) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = rot + (i * PI) / n;
    i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

export function drawFx(g) {
  for (const p of parts) {
    const a = Math.max(0, p.life / p.max), prog = 1 - a;
    if (p.t === "star") {
      const rr = p.r * (0.75 + 0.6 * Math.min(1, prog * 3));
      starPath(g, p.x, p.y, rr, rr * 0.5, 10, prog);
      g.fillStyle = p.blk ? "#8fd8ff" : "#ffe14d"; g.fill();
      g.strokeStyle = OUT; g.lineWidth = 3; g.lineJoin = "round"; g.stroke();
      starPath(g, p.x, p.y, rr * 0.5, rr * 0.25, 10, prog); g.fillStyle = "#fff"; g.fill();
    } else if (p.t === "word") {
      g.save(); g.translate(p.x, p.y - prog * 24); g.rotate(-0.16);
      const s = prog < 0.12 ? 0.4 + (prog / 0.12) * 0.8 : 1.2 - Math.min(0.2, prog - 0.12);
      g.scale(s, s); g.globalAlpha = Math.min(1, a * 3);
      g.font = '900 34px "Arial Black", Impact, system-ui, sans-serif';
      g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      g.lineWidth = 7; g.strokeStyle = OUT; g.strokeText(p.text, 0, 0);
      g.fillStyle = p.blk ? "#a6e1ff" : "#ffd93b"; g.fillText(p.text, 0, 0);
      g.restore();
    } else if (p.t === "bit") {
      g.fillStyle = OUT; circlePath(g, [p.x, p.y], p.r + 1.5); g.fill();
      g.fillStyle = "#fff"; circlePath(g, [p.x, p.y], p.r); g.fill();
    }
  }
}

/** White streak behind a fast-moving fist. */
export function drawTrail(g, trail) {
  const segs = [];
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i], dtc = b.t - a.t;
    if (dtc <= 0 || Math.hypot(b.x - a.x, b.y - a.y) / dtc < 600) continue;
    segs.push([a, b, Math.max(0, 1 - (time.gt - b.t) / 0.1)]);
  }
  if (!segs.length) return;
  g.lineCap = "round";
  for (const [a, b, al] of segs) { g.strokeStyle = `rgba(29,22,34,${al})`; g.lineWidth = 5 + 10 * al; lineXY(g, a.x, a.y, b.x, b.y); }
  for (const [a, b, al] of segs) { g.strokeStyle = `rgba(255,255,255,${al})`; g.lineWidth = 2 + 9 * al; lineXY(g, a.x, a.y, b.x, b.y); }
}
