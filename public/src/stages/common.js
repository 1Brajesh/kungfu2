// Helpers shared by the stages.
import { W, H, PI } from "../config.js";
import { circlePath } from "../draw.js";

/** Small seeded random number generator, so scenery is the same every time. */
export function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** A rolling hill line across the screen. */
export function makeRidge(seed, base, amp) {
  const r = mulberry(seed), f = [0.004 + r() * 0.002, 0.011 + r() * 0.004, 0.025 + r() * 0.01], ph = [r() * 6, r() * 6, r() * 6], pts = [];
  const wave = (v) => 0.5 + 0.5 * Math.sin(v);
  for (let x = -40; x <= W + 40; x += 6) {
    pts.push([x, base - amp * (0.55 * wave(x * f[0] + ph[0]) + 0.3 * Math.sin(x * f[1] + ph[1]) + 0.15 * wave(x * f[2] + ph[2]))]);
  }
  return pts;
}
export function fillRidge(g, pts, col) {
  g.fillStyle = col; g.beginPath(); g.moveTo(-40, H + 40);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineTo(W + 40, H + 40); g.closePath(); g.fill();
}

export function cloud(g, x, y, s, top = "#ffffff", under = "#dcefff") {
  const blobs = [[0, 0, 28], [30, -12, 34], [62, 0, 26], [30, 8, 30]];
  g.fillStyle = under; for (const b of blobs) { circlePath(g, [x + b[0] * s, y + b[1] * s + 5], b[2] * s); g.fill(); }
  g.fillStyle = top; for (const b of blobs) { circlePath(g, [x + b[0] * s, y + b[1] * s], b[2] * s); g.fill(); }
}

/** A point on a quadratic curve. */
export const quad = (a, c, b, t) => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];

/** Something that wobbles when hit and settles back (a damped spring). Call kick() on impacts. */
export function wobble(stiff = 30, damp = 3) {
  return {
    v: 0, x: 0,
    kick(a) { this.v += a; },
    update(dt) { this.v += (-stiff * this.x - damp * this.v) * dt; this.x += this.v * dt; },
  };
}

/** A leaf or petal falling with a tumble. */
export function tumbleFlake(g, p, col, w, h) {
  g.save(); g.translate(p.x, p.y); g.rotate(p.r);
  g.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(p.r * 1.7)));
  g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, PI * 2); g.fill();
  g.restore();
}
