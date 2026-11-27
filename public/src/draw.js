// Draws fighters in the cartoon style, plus the skeleton view.
import { L, PI, OUT, LIGHT, SC, GROUND } from "./config.js";
import { toWorld, hurtShapes, LIMB, strikeRadius } from "./fighter.js";

export const circlePath = (g, c, r) => { g.beginPath(); g.arc(c[0], c[1], r, 0, PI * 2); };
export function lineXY(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
export function taperPath(g, a, b, ra, rb) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  g.beginPath();
  g.arc(a[0], a[1], ra, ang + PI / 2, ang - PI / 2);
  g.arc(b[0], b[1], rb, ang - PI / 2, ang + PI / 2);
  g.closePath();
}

const shadeCache = {};
export function shade(hex, f) {
  if (f === 1) return hex;
  const k = hex + f;
  if (shadeCache[k]) return shadeCache[k];
  const n = parseInt(hex.slice(1), 16);
  return (shadeCache[k] = `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`);
}
/** Like shade() but keeps hex form so it can be shaded again. */
function hexShade(hex, f) {
  const n = parseInt(hex.slice(1), 16), c = (v) => Math.round(v * f).toString(16).padStart(2, "0");
  return "#" + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255);
}

/** Flat colour with one hard shadow edge across the limb, on the side away from the light. */
function celFill(g, a, b, ra, rb, col, light) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (nx * light[0] + ny * light[1] < 0) { nx = -nx; ny = -ny; }
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r = Math.max(ra, rb);
  const gr = g.createLinearGradient(m[0] + nx * r, m[1] + ny * r, m[0] - nx * r, m[1] - ny * r);
  const dark = shade(col, 0.78);
  gr.addColorStop(0, col); gr.addColorStop(0.56, col); gr.addColorStop(0.56, dark); gr.addColorStop(1, dark);
  g.fillStyle = gr; taperPath(g, a, b, ra, rb); g.fill();
}

/** Local coords: facing right, hip at origin. */
function figure(g, s, pal, light) {
  const groups = [
    { back: true, segs: [[s.shoulder, s.aB.el, 5, 4.2, "sleeve"], [s.aB.el, s.aB.wr, 4, 3.4, "skin"]], fist: s.aB.wr },
    { back: true, segs: [[s.hip, s.lB.knee, 8.5, 6.4, "pants"], [s.lB.knee, s.lB.an, 6.4, 5.6, "pants"], [s.lB.an, s.lB.toe, 3.7, 2.5, "skin"]] },
    { torso: true, segs: [[s.shoulder, s.head, 4.2, 4.2, "skin"], [s.hip, s.shoulder, 10.5, 12.5, "gi"]] },
    { head: true },
    { segs: [[s.hip, s.lF.knee, 8.5, 6.4, "pants"], [s.lF.knee, s.lF.an, 6.4, 5.6, "pants"], [s.lF.an, s.lF.toe, 3.7, 2.5, "skin"]] },
    { segs: [[s.shoulder, s.aF.el, 5, 4.2, "sleeve"], [s.aF.el, s.aF.wr, 4, 3.4, "skin"]], fist: s.aF.wr },
  ];
  for (const gr of groups) {
    if (gr.head) { drawHead(g, s, pal, light); continue; }
    const d = gr.back ? 0.8 : 1;
    g.fillStyle = OUT;
    for (const q of gr.segs) { taperPath(g, q[0], q[1], q[2] + 1.6, q[3] + 1.6); g.fill(); }
    if (gr.fist) { circlePath(g, gr.fist, 6.2); g.fill(); }
    for (const q of gr.segs) celFill(g, q[0], q[1], q[2], q[3], d === 1 ? pal[q[4]] : hexShade(pal[q[4]], d), light);
    if (gr.fist) { g.fillStyle = hexShade(pal.skin, d); circlePath(g, gr.fist, 4.6); g.fill(); }
    if (gr.torso) torsoDetails(g, s, pal);
  }
}

function torsoDetails(g, s, pal) {
  const ux = s.shoulder[0] - s.hip[0], uy = s.shoulder[1] - s.hip[1], ul = Math.hypot(ux, uy);
  const u = [ux / ul, uy / ul], f = [-u[1], u[0]];
  const Pt = (b, a, c) => [b[0] + u[0] * a + f[0] * c, b[1] + u[1] * a + f[1] * c];
  const v1 = Pt(s.shoulder, 4, 1), v2 = Pt(s.shoulder, 3, 11), v3 = Pt(s.shoulder, -13, 7);
  g.fillStyle = pal.skin; g.beginPath(); g.moveTo(...v1); g.lineTo(...v2); g.lineTo(...v3); g.closePath(); g.fill();
  g.strokeStyle = OUT; g.lineWidth = 1.3; g.lineJoin = "round";
  g.beginPath(); g.moveTo(...Pt(s.shoulder, 4, -3)); g.lineTo(...v3); g.lineTo(...Pt(s.hip, 9, 11)); g.stroke();
  const b0 = Pt(s.hip, 9, -11), b1 = Pt(s.hip, 9, 11.5);
  g.fillStyle = OUT; taperPath(g, b0, b1, 3.6, 3.6); g.fill();
  g.fillStyle = pal.belt; taperPath(g, b0, b1, 2.4, 2.4); g.fill();
  const kn = Pt(s.hip, 9, 9), t1 = Pt(s.hip, -1, 13), t2 = Pt(s.hip, 0, 7);
  g.lineCap = "round";
  for (const [w, c] of [[4, OUT], [2.2, pal.belt]]) {
    g.strokeStyle = c; g.lineWidth = w;
    lineXY(g, kn[0], kn[1], t1[0], t1[1]); lineXY(g, kn[0], kn[1], t2[0], t2[1]);
  }
}

function drawHead(g, s, p, light) {
  const R = L.headR, hx = 0, hy = 0;
  g.save();
  g.translate(s.head[0], s.head[1]); g.rotate(s.headRot);
  g.fillStyle = OUT;
  circlePath(g, [hx, hy], R + 1.6); g.fill();
  circlePath(g, [hx - 5, hy - R], 6); g.fill();
  circlePath(g, [hx - R, hy - 6.5], 4.2); g.fill();
  g.fillStyle = p.hair; circlePath(g, [hx - 5, hy - R], 4.4); g.fill();
  g.save(); circlePath(g, [hx, hy], R); g.clip();
  g.fillStyle = shade(p.skin, 0.8); g.fillRect(hx - R - 2, hy - R - 2, 2 * R + 4, 2 * R + 4);
  g.fillStyle = p.skin; circlePath(g, [hx + light[0] * 3.5, hy + light[1] * 3.5], R * 0.98); g.fill();
  g.fillStyle = p.hair; circlePath(g, [hx - 6, hy - 8], 10.5); g.fill();
  g.lineCap = "butt";
  g.strokeStyle = OUT; g.lineWidth = 5.4; lineXY(g, hx - R - 2, hy - 5.5, hx + R + 2, hy - 7.6);
  g.strokeStyle = p.band; g.lineWidth = 3.4; lineXY(g, hx - R - 2, hy - 5.5, hx + R + 2, hy - 7.6);
  g.restore();
  g.fillStyle = p.band; circlePath(g, [hx - R, hy - 6.5], 2.6); g.fill();
  g.fillStyle = OUT; circlePath(g, [hx - 1.5, hy + 1.5], 3.4); g.fill();
  g.fillStyle = p.skin; circlePath(g, [hx - 1.5, hy + 1.5], 2.3); g.fill();
  g.fillStyle = OUT; g.beginPath(); g.ellipse(hx + 6.2, hy - 0.6, 1.3, 2.1, 0, 0, PI * 2); g.fill();
  g.strokeStyle = OUT; g.lineWidth = 1.3; g.lineCap = "round";
  lineXY(g, hx + 3.6, hy - 3.4, hx + 8.8, hy - 2.6);
  lineXY(g, hx + 6.5, hy + 5.4, hx + 9, hy + 5);
  g.restore();
}

export function drawFighter(g, f) {
  g.save();
  g.translate(f.hx, f.hy); g.scale(f.sign * SC, SC);
  figure(g, f.sol, f.pal, [LIGHT[0] * f.sign, LIGHT[1]]);
  g.restore();
}

export function drawRibbons(g, f) {
  for (const r of f.rib) {
    if (!r.pts) continue;
    const pts = r.pts;
    const path = () => {
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      const e = pts[pts.length - 1]; g.lineTo(e.x, e.y);
    };
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = OUT; g.lineWidth = 6.5; path(); g.stroke();
    g.strokeStyle = f.pal.band; g.lineWidth = 3.8; path(); g.stroke();
  }
}

/** Ground shadow under the body; wider when lying down, smaller when high in the air. */
export function drawShadow(g, f) {
  const s = f.sol;
  let lo = Infinity, hi = -Infinity;
  for (const pt of [s.hip, s.head, s.lF.toe, s.lB.toe, s.lF.knee, s.lB.knee]) { const x = toWorld(f, pt)[0]; lo = Math.min(lo, x); hi = Math.max(hi, x); }
  const k = Math.max(0.35, 1 - f.y / 220), cx = (lo + hi) / 2, rx = Math.max(42, (hi - lo) / 2 + 14) * k;
  g.fillStyle = "rgba(90,60,30,0.25)";
  g.beginPath(); g.ellipse(cx, GROUND + 4, rx, 7 * k, 0, 0, PI * 2); g.fill();
}

/** Little stars circling the head after the guard is broken. */
export function drawDizzy(g, f, wt) {
  if (!f.move || f.move.name !== "stagger") return;
  const h = toWorld(f, f.sol.head);
  for (let i = 0; i < 3; i++) {
    const a = wt * 5 + (i * 2 * PI) / 3, x = h[0] + Math.cos(a) * 26, y = h[1] - 30 + Math.sin(a) * 7;
    g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath();
    for (let j = 0; j < 10; j++) { const r = j % 2 ? 3 : 7.5, b = (j * PI) / 5; g.lineTo(Math.cos(b) * r, Math.sin(b) * r); }
    g.closePath(); g.fillStyle = "#ffe14d"; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.8; g.stroke();
    g.restore();
  }
}

/** Skeleton view: bones, joints, the parts that can be hit (blue), the striking point (red) and where each foot is planted (yellow). */
export function drawRig(g, f) {
  const s = f.sol, w = (p) => toWorld(f, p);
  g.lineCap = "round"; g.lineWidth = 2;
  const bones = [[s.hip, s.shoulder], [s.shoulder, s.head], [s.shoulder, s.aF.el], [s.aF.el, s.aF.wr], [s.shoulder, s.aB.el], [s.aB.el, s.aB.wr],
    [s.hip, s.lF.knee], [s.lF.knee, s.lF.an], [s.lF.an, s.lF.toe], [s.hip, s.lB.knee], [s.lB.knee, s.lB.an], [s.lB.an, s.lB.toe]];
  g.strokeStyle = "#39ff88";
  for (const [a, b] of bones) { const p = w(a), q = w(b); lineXY(g, p[0], p[1], q[0], q[1]); }
  g.fillStyle = "#39ff88";
  for (const j of [s.hip, s.shoulder, s.head, s.aF.el, s.aF.wr, s.aB.el, s.aB.wr, s.lF.knee, s.lF.an, s.lB.knee, s.lB.an]) { circlePath(g, w(j), 3); g.fill(); }
  const inv = f.move && f.move.inv && f.mt >= f.move.inv[0] && f.mt <= f.move.inv[1];
  g.strokeStyle = inv ? "rgba(255,255,255,0.5)" : "rgba(80,200,255,0.9)"; g.lineWidth = 1.5;
  for (const h of hurtShapes(f)) { taperPath(g, h.a, h.b, h.r, h.r); g.stroke(); }
  const m = f.move;
  if (m && m.limb) {
    const live = m.active && f.mt >= m.active[0] && f.mt <= m.active[1];
    const pt = w(LIMB[m.limb](s));
    g.strokeStyle = live ? "#ff3355" : "rgba(255,51,85,0.45)"; g.lineWidth = 2.5;
    circlePath(g, pt, strikeRadius(m.limb)); g.stroke();
  }
  g.fillStyle = "#ffd23a";
  for (const ft of f.feet) g.fillRect(ft.x - 2, GROUND + 8, 4, 8);
}
