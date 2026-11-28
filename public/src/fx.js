// Effects: comic hit stars and words, flying bits, speed-line bursts, shock rings, dust, screen flash
// and the smear streak behind every strike.
import { W, H, PI, OUT, GROUND, time } from "./config.js";
import { circlePath, lineXY } from "./draw.js";

let parts = [], dust = [], flash = 0;

const WORDS = { block: "BLOCK!", break: "BREAK!", kd: "WHAM!", ko: "BAM!" };
const DUST = "#f7eedb", DUST_EDGE = "#c8ad80";

/** kind: hit, block, break, kd or ko (from applyHit). */
export function spawnHit(x, y, pow, kind = "hit", dir = 1) {
  const blk = kind === "block", big = kind === "kd" || kind === "ko" || kind === "break" || pow >= 1.5;
  const text = WORDS[kind] || (pow >= 1.5 ? "WHAM!" : "POW!");
  parts.push({ t: "star", x, y, life: big ? 0.3 : 0.22, max: big ? 0.3 : 0.22, r: 26 * Math.min(pow, 2.2), blk });
  parts.push({ t: "word", x: x + 18 * dir, y: y - 50, life: 0.7, max: 0.7, text, blk, brk: kind === "break", s: big ? 1.25 : 1 });
  for (let i = 0; i < (blk ? 5 : 8 + Math.round(pow * 3)); i++) {
    // bits fly mostly the way the blow travels
    const a = (Math.random() - 0.5) * 2.4, sp = 200 + Math.random() * 380 * Math.min(pow, 1.8);
    parts.push({ t: "bit", x, y, vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp - 150, life: 0.38, max: 0.38, r: 2 + Math.random() * 3 });
  }
  if (big && !blk) {
    parts.push({ t: "burst", x, y, life: 0.2, max: 0.2, n: 14 + Math.round(pow * 3), r: 40 + pow * 16, rot: Math.random() * PI });
    parts.push({ t: "ring", x, y, life: 0.28, max: 0.28, r: 30 + pow * 30 });
  }
  if (kind === "ko") flash = Math.max(flash, 0.16);
  else if (kind === "kd" || kind === "break") flash = Math.max(flash, 0.08);
}

/**
 * A puff of dust on the ground. n puffs spread over `spread` px, each growing from r to about 2r,
 * drifting in `dir` (-1, 0 or 1) at up to `speed` px/s.
 */
export function spawnDust(x, n, r, spread = 10, dir = 0, speed = 60, life = 0.45) {
  for (let i = 0; i < n; i++) {
    const d = dir || (Math.random() < 0.5 ? -1 : 1);
    dust.push({
      x: x + (Math.random() - 0.5) * spread, y: GROUND - 2 - Math.random() * 4,
      vx: d * speed * (0.4 + Math.random() * 0.6), vy: -(15 + Math.random() * 35),
      r: r * (0.7 + Math.random() * 0.5), life: life * (0.75 + Math.random() * 0.4), max: 0,
    });
    dust[dust.length - 1].max = dust[dust.length - 1].life;
  }
}

/** Turns a fighter event (see fighter.js) into dust. */
export function fighterEvent(e, f) {
  if (e.t === "step") { if (e.v > 260) spawnDust(e.x, 2, 4.5, 8, -e.dir, 40, 0.35); }
  else if (e.t === "land") {
    const k = Math.min(1.6, e.v / 600);
    if (e.down) spawnDust(e.x, 10, 9, 70, 0, 140, 0.6);
    else spawnDust(e.x, 3 + Math.round(4 * k), 5 + 3 * k, 30, 0, 110 * k + 40, 0.45);
  } else if (e.t === "slam") spawnDust(e.x, 12, 9, 110, 0, 160, 0.65);
  else if (e.t === "skid") spawnDust(e.x, 1, 4 + Math.min(4, e.v / 120), 6, -e.dir, 50, 0.4);
  else if (e.t === "roll") spawnDust(e.x, 4, 6, 20, -e.dir, 90, 0.45);
}

export const clearFx = () => { parts = []; dust = []; flash = 0; };

export function updateFx(dt) {
  for (const p of parts) {
    p.life -= dt;
    if (p.vx !== undefined) { p.vy += 1200 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  parts = parts.filter((p) => p.life > 0);
  for (const d of dust) {
    d.life -= dt;
    d.vx *= Math.exp(-3 * dt); d.vy *= Math.exp(-2 * dt);
    d.x += d.vx * dt; d.y += d.vy * dt;
  }
  dust = dust.filter((d) => d.life > 0);
  flash = Math.max(0, flash - dt);
}

function starPath(g, x, y, ro, ri, n, rot) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro, a = rot + (i * PI) / n;
    i ? g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

/** Dust puffs: round cartoon clouds with a soft tan edge. */
export function drawDust(g) {
  if (!dust.length) return;
  for (const pass of [0, 1]) {
    for (const d of dust) {
      const u = 1 - d.life / d.max, r = d.r * (1 + u * 1.1), a = Math.min(1, (d.life / d.max) * 2.2);
      g.globalAlpha = a * 0.9;
      g.fillStyle = pass ? DUST : DUST_EDGE;
      circlePath(g, [d.x, d.y - u * 6], pass ? r : r + 1.8); g.fill();
    }
  }
  g.globalAlpha = 1;
}

export function drawFx(g) {
  for (const p of parts) {
    const a = Math.max(0, p.life / p.max), prog = 1 - a;
    if (p.t === "burst") {
      // comic speed lines radiating out of a big hit
      g.lineCap = "round";
      for (let i = 0; i < p.n; i++) {
        const ang = p.rot + (i * 2 * PI) / p.n + (i % 2) * 0.1, r0 = p.r * (0.55 + prog * 0.5), r1 = p.r * (1.1 + prog * 0.9) * (i % 3 ? 1 : 1.3);
        const x0 = p.x + Math.cos(ang) * r0, y0 = p.y + Math.sin(ang) * r0, x1 = p.x + Math.cos(ang) * r1, y1 = p.y + Math.sin(ang) * r1;
        g.strokeStyle = OUT; g.lineWidth = 5 * a + 1; lineXY(g, x0, y0, x1, y1);
        g.strokeStyle = "#fff"; g.lineWidth = 2.6 * a; lineXY(g, x0, y0, x1, y1);
      }
    } else if (p.t === "ring") {
      g.strokeStyle = `rgba(255,255,255,${a * 0.9})`; g.lineWidth = 3 + 7 * a;
      g.beginPath(); g.ellipse(p.x, p.y, p.r * (0.4 + prog), p.r * (0.4 + prog) * 0.8, 0, 0, PI * 2); g.stroke();
    } else if (p.t === "star") {
      const rr = p.r * (0.75 + 0.6 * Math.min(1, prog * 3));
      starPath(g, p.x, p.y, rr, rr * 0.5, 10, prog);
      g.fillStyle = p.blk ? "#8fd8ff" : "#ffe14d"; g.fill();
      g.strokeStyle = OUT; g.lineWidth = 3; g.lineJoin = "round"; g.stroke();
      starPath(g, p.x, p.y, rr * 0.5, rr * 0.25, 10, prog); g.fillStyle = "#fff"; g.fill();
    } else if (p.t === "word") {
      g.save(); g.translate(p.x, p.y - prog * 24); g.rotate(-0.16);
      const s = (prog < 0.12 ? 0.4 + (prog / 0.12) * 0.8 : 1.2 - Math.min(0.2, prog - 0.12)) * p.s;
      g.scale(s, s); g.globalAlpha = Math.min(1, a * 3);
      g.font = '900 34px "Arial Black", Impact, system-ui, sans-serif';
      g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
      g.lineWidth = 7; g.strokeStyle = OUT; g.strokeText(p.text, 0, 0);
      g.fillStyle = p.blk ? "#a6e1ff" : p.brk ? "#ff8a3d" : "#ffd93b"; g.fillText(p.text, 0, 0);
      g.restore();
    } else if (p.t === "bit") {
      g.fillStyle = OUT; circlePath(g, [p.x, p.y], p.r + 1.5); g.fill();
      g.fillStyle = "#fff"; circlePath(g, [p.x, p.y], p.r); g.fill();
    }
  }
}

/** A brief white flash over the whole screen on knockdowns and the K.O. */
export function drawFlash(g) {
  if (flash <= 0) return;
  g.fillStyle = `rgba(255,255,255,${Math.min(0.38, flash * 3)})`;
  g.fillRect(-20, -20, W + 40, H + 40);
}

/**
 * The streak behind a strike, from where the fist or foot was over the last moment.
 * Punches get comic speed lines above and below the arm (a smear would hide behind the arm);
 * kicks get a tapered white smear along the arc of the foot, thick at the foot and thin at the tail.
 */
export function drawTrail(g, trail, life) {
  const n = trail.length;
  if (n < 2) return;
  let path = 0;
  for (let i = 1; i < n; i++) path += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
  if (path < 18) return;
  const head = trail[n - 1], fresh = Math.max(0, 1 - (time.gt - head.t) / (life * 0.6));
  if (fresh <= 0) return;
  // unit normals along the path
  const nor = trail.map((p, i) => {
    const q = trail[Math.min(i + 1, n - 1)], o = trail[Math.max(i - 1, 0)];
    const dx = q.x - o.x, dy = q.y - o.y, len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  });
  const age = (p) => Math.max(0, 1 - (time.gt - p.t) / life);
  g.lineJoin = "round"; g.lineCap = "round";
  if (head.fist) {
    const lines = [[-13, 1], [12, 1], [-21, 0.7], [20, 0.6]];
    for (const pass of [0, 1]) {
      for (const [off, len] of lines) {
        const from = Math.floor((n - 1) * (1 - len)), to = n - 1;
        if (to - from < 1) continue;
        g.beginPath();
        for (let i = from; i <= to; i++) {
          const k = off * (0.6 + 0.4 * (i / (n - 1)));
          const x = trail[i].x + nor[i][0] * k, y = trail[i].y + nor[i][1] * k;
          i === from ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        const w = (2.2 + head.w) * fresh;
        g.strokeStyle = pass ? "#fff" : OUT; g.lineWidth = pass ? w : w + 3; g.stroke();
      }
    }
    return;
  }
  const maxW = (8 + 5 * Math.min(head.w, 2)) * fresh;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const hw = maxW * Math.pow(i / (n - 1), 0.6) * age(trail[i]);
    L.push([trail[i].x - nor[i][0] * hw, trail[i].y - nor[i][1] * hw]);
    R.push([trail[i].x + nor[i][0] * hw, trail[i].y + nor[i][1] * hw]);
  }
  const body = () => {
    g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (const p of L) g.lineTo(p[0], p[1]);
    for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
    g.closePath();
  };
  const tip = () => circlePath(g, [head.x, head.y], maxW);
  g.strokeStyle = OUT; g.lineWidth = 3.5;
  body(); g.stroke(); tip(); g.stroke();
  g.fillStyle = "#fff";
  body(); g.fill(); tip(); g.fill();
}
