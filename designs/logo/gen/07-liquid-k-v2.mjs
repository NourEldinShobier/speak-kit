// Liquid K v2: swept-disc skeleton -> exact union SDF -> morphological closing (exact inner fillet radius)
// -> sub-pixel contour -> Gaussian smoothing -> G1 cubic (Catmull-Rom) fit. Writes svg/07-liquid-k-v2.svg and -v2-free.svg.
import fs from 'node:fs';
const P = {
  H: 560, rEnd: 36, rMid: 54, pBell: 1.25, fillet: 26,
  arm: { dx: 252, bow: 6, r0: 44, rN: 28, bulb: 4 },
  leg: { dx: 292, bow: 6, r0: 44, rN: 28, bulb: 4 },
  J: [14, 0], thetaSigma: 0, dotR: 32, gap: 28, nudge: { x: 0, y: 8 },
};
// ---- skeleton (local coords: stem centreline x=0, K centre y=0)
const halfC = P.H / 2 - P.rEnd; // stem centre-line half length
const S = 2; // disc spacing px
const stem = [];
for (let y = -halfC; y <= halfC + 1e-6; y += S) {
  const t = (y + halfC) / (2 * halfC);
  const b = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * t), P.pBell);
  stem.push([0, y, P.rEnd + (P.rMid - P.rEnd) * b]);
}
// monotone-ish Hermite through control points (smooth, no overshoot beyond points for our data)
const interp = (pts, t) => {
  let i = 0; while (i < pts.length - 2 && t > pts[i + 1][0]) i++;
  const [t0, v0] = pts[i], [t1, v1] = pts[i + 1];
  const slope = k => k <= 0 || k >= pts.length - 1 ? 0 : (pts[k + 1][1] - pts[k - 1][1]) / (pts[k + 1][0] - pts[k - 1][0]);
  const h = t1 - t0, u = (t - t0) / h, m0 = slope(i) * h, m1 = slope(i + 1) * h;
  return (2 * u ** 3 - 3 * u ** 2 + 1) * v0 + (u ** 3 - 2 * u ** 2 + u) * m0 + (-2 * u ** 3 + 3 * u ** 2) * v1 + (u ** 3 - u ** 2) * m1;
};
const limb = (sgn, c) => { // sgn -1 arm (up), +1 leg (down)
  const p0 = P.J, p2 = [P.J[0] + c.dx, sgn * (halfC)];
  const dx = p2[0] - p0[0], dy = p2[1] - p0[1], L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L; // normal; bow away from the notch (outer side)
  const dir = sgn < 0 ? 1 : -1; // arm: normal (nx,ny) points down-left? choose so bow goes outward
  const p1 = [(p0[0] + p2[0]) / 2 + dir * nx * c.bow * -1, (p0[1] + p2[1]) / 2 + dir * ny * c.bow * -1];
  const n = Math.ceil(L / S), out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) ** 2, b = 2 * (1 - t) * t, c2 = t * t;
    out.push([a * p0[0] + b * p1[0] + c2 * p2[0], a * p0[1] + b * p1[1] + c2 * p2[1], c.rN + (c.r0 - c.rN) * (1 - t) ** 1.3 + c.bulb * Math.exp(-(((1 - t) / 0.13) ** 2))]); }
  return { pts: out, tip: p2, dirTip: [2 * (p2[0] - p1[0]), 2 * (p2[1] - p1[1])] };
};
const arm = limb(-1, P.arm), leg = limb(1, P.leg);
const discs = [...stem, ...arm.pts, ...leg.pts];
// ---- grid
const g = 0.5, x0 = -80, x1 = 400, y0 = -310, y1 = 310;
const W = Math.round((x1 - x0) / g) + 1, Hh = Math.round((y1 - y0) / g) + 1;
const U = new Float32Array(W * Hh);
for (let j = 0; j < Hh; j++) { const y = y0 + j * g; for (let i = 0; i < W; i++) { const x = x0 + i * g; let m = 1e9;
  for (const d of discs) { const dxx = x - d[0]; if (dxx > m + d[2] + 60 && false) continue; const v = Math.hypot(dxx, y - d[1]) - d[2]; if (v < m) m = v; }
  U[j * W + i] = m; } }
// ---- closing: dilate by f (U<f), then erode by f using exact EDT to the complement
const f = P.fillet, INF = 1e10;
const edt1 = (fn, n, out, v, z) => { let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) { let s = ((fn[q] + q * q) - (fn[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((fn[q] + q * q) - (fn[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF; }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; out[q] = (q - v[k]) ** 2 + fn[v[k]]; } };
const sq = new Float64Array(W * Hh); for (let i = 0; i < sq.length; i++) sq[i] = U[i] < f ? INF : 0; // 0 at complement cells
{ const n = Math.max(W, Hh), fn = new Float64Array(n), o = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let i = 0; i < W; i++) { for (let j = 0; j < Hh; j++) fn[j] = sq[j * W + i]; edt1(fn, Hh, o, v, z); for (let j = 0; j < Hh; j++) sq[j * W + i] = o[j]; }
  for (let j = 0; j < Hh; j++) { for (let i = 0; i < W; i++) fn[i] = sq[j * W + i]; edt1(fn, W, o, v, z); for (let i = 0; i < W; i++) sq[j * W + i] = o[i]; } }
const F = new Float32Array(W * Hh); // >0 inside
for (let i = 0; i < F.length; i++) F[i] = U[i] >= f ? -(Math.max(U[i] - f, 0.0001)) : Math.sqrt(sq[i]) * g - 0.5 * g - f;
// For cells outside D use true negative distance (U-f) so the contour region stays signed; inside D use EDT.
// ---- marching squares (linear interp); positive = inside
const lerp = (a, b, fa, fb) => a + (b - a) * (fa / (fa - fb));
const trace = (FF) => {
const adj = new Map();

const link = (a, b) => { for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p.id)) adj.set(p.id, { p, n: [] }); adj.get(p.id).n.push(q.id); } };
for (let j = 0; j < Hh - 1; j++) for (let i = 0; i < W - 1; i++) {
  const fv = [FF[j * W + i], FF[j * W + i + 1], FF[(j + 1) * W + i + 1], FF[(j + 1) * W + i]];
  const X = x0 + i * g, Y = y0 + j * g;
  const e = [() => Object.assign([lerp(X, X + g, fv[0], fv[1]), Y], { id: `h${i},${j}` }), () => Object.assign([X + g, lerp(Y, Y + g, fv[1], fv[2])], { id: `v${i + 1},${j}` }),
    () => Object.assign([lerp(X, X + g, fv[3], fv[2]), Y + g], { id: `h${i},${j + 1}` }), () => Object.assign([X, lerp(Y, Y + g, fv[0], fv[3])], { id: `v${i},${j}` })];
  let c = 0; fv.forEach((v, n) => { if (v > 0) c |= 1 << n; });
  const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]] };
  if (c === 5) { link(e[3](), e[0]()); link(e[1](), e[2]()); continue; }
  if (c === 10) { link(e[0](), e[1]()); link(e[2](), e[3]()); continue; }
  for (const s of T[c] || []) link(e[s[0]](), e[s[1]]());
}
const seen = new Set(); let loop = [];
for (const st of adj.keys()) { if (seen.has(st)) continue; const lp = [adj.get(st).p]; seen.add(st); let prev = null, cur = st;
  for (;;) { const nb = adj.get(cur).n; const n = nb.find(k => k !== prev && (!seen.has(k) || k === st)); if (n === undefined || n === st) break; prev = cur; cur = n; seen.add(cur); lp.push(adj.get(cur).p); }
  if (lp.length > loop.length) loop = lp; }
return loop;
};
let loop0 = trace(F.map((v, i) => f - U[i]));
// refine band: exact distance to the (analytic-quality) dilated boundary polyline
{ const poly = loop0, n = poly.length, band = 4;
  const sub = (cx2, cy2) => { let m = 1e18; for (let k = 0; k < n; k++) { const a = poly[k], b = poly[(k + 1) % n]; const ex = b[0] - a[0], ey = b[1] - a[1];
      let t = ((cx2 - a[0]) * ex + (cy2 - a[1]) * ey) / (ex * ex + ey * ey); t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = cx2 - a[0] - t * ex, dy = cy2 - a[1] - t * ey; const dd = dx * dx + dy * dy; if (dd < m) m = dd; } return Math.sqrt(m); };
  // spatial bucket for speed
  const cell = 16, bk = new Map(); const kk = (i, j) => i * 100003 + j;
  poly.forEach((a, k) => { const key = kk(Math.floor(a[0] / cell), Math.floor(a[1] / cell)); if (!bk.has(key)) bk.set(key, []); bk.get(key).push(k); });
  const near = (cx2, cy2) => { let m = 1e18; const ci = Math.floor(cx2 / cell), cj = Math.floor(cy2 / cell);
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) { const l = bk.get(kk(ci + di, cj + dj)); if (!l) continue; for (const k of l) for (const q of [k - 1, k]) { const a = poly[(q + n) % n], b = poly[(q + 1 + n) % n]; const ex = b[0] - a[0], ey = b[1] - a[1];
        let t = ((cx2 - a[0]) * ex + (cy2 - a[1]) * ey) / (ex * ex + ey * ey); t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = cx2 - a[0] - t * ex, dy = cy2 - a[1] - t * ey; const dd = dx * dx + dy * dy; if (dd < m) m = dd; } }
    return Math.sqrt(m); };
  let cnt = 0;
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (Math.abs(F[k]) < band && U[k] < f) { const d = near(x0 + i * g, y0 + j * g); F[k] = d - f; cnt++; } }
  console.log('refined cells', cnt); }
const loop = trace(F);
// ---- resample 0.5 px uniform, Gaussian smooth, then node sampling
const resample = (pts, step) => { const n = pts.length, cum = [0];
  for (let i = 1; i <= n; i++) { const a = pts[i - 1], b = pts[i % n]; cum.push(cum[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1])); }
  const L = cum[n], M = Math.round(L / step), out = []; let k = 0;
  for (let m = 0; m < M; m++) { const s = L * m / M; while (cum[k + 1] < s) k++; const t = (s - cum[k]) / (cum[k + 1] - cum[k] || 1); const a = pts[k], b = pts[(k + 1) % n]; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  return { out, L: L }; };
let { out: dense, L } = resample(loop, 0.5);
const sigma = 3, step = L / dense.length, rad = Math.ceil(3 * sigma / step), wts = []; let ws = 0;
for (let k = -rad; k <= rad; k++) { const w = Math.exp(-0.5 * (k * step / sigma) ** 2); wts.push(w); ws += w; }
const N = dense.length;
dense = dense.map((_, i) => { let x = 0, y = 0; for (let k = -rad; k <= rad; k++) { const p = dense[(i + k + N * 4) % N]; const w = wts[k + rad]; x += p[0] * w; y += p[1] * w; } return [x / ws, y / ws]; });
// tangent-angle smoothing: remove curvature jitter without shrinking tight radii
if (P.thetaSigma) { const n = dense.length, ds = L / n, sg = P.thetaSigma;
  const th = new Float64Array(n); let prev = 0;
  for (let i = 0; i < n; i++) { const a = dense[(i + n - 1) % n], b = dense[(i + 1) % n]; let t = Math.atan2(b[1] - a[1], b[0] - a[0]); if (i > 0) { while (t - prev > Math.PI) t -= 2 * Math.PI; while (t - prev < -Math.PI) t += 2 * Math.PI; } th[i] = t; prev = t; }
  const turn = Math.round((th[n - 1] - th[0]) / (2 * Math.PI)) * 2 * Math.PI; // total turning (+-2pi), last-first approximates it
  const ph = th.map((t, i) => t - turn * i / n);
  const r2 = Math.ceil(3 * sg / ds), w2 = []; let s2 = 0; for (let k = -r2; k <= r2; k++) { const w = Math.exp(-0.5 * (k * ds / sg) ** 2); w2.push(w); s2 += w; }
  const sm = ph.map((_, i) => { let a = 0; for (let k = -r2; k <= r2; k++) a += ph[(i + k + n * 4) % n] * w2[k + r2]; return a / s2 + turn * i / n; });
  const q = [[dense[0][0], dense[0][1]]];
  for (let i = 0; i < n; i++) { const a = (sm[i] + sm[(i + 1) % n + (i + 1 === n ? 0 : 0)] + (i + 1 === n ? turn : 0)) / 2; const l = q[i]; q.push([l[0] + ds * Math.cos(a), l[1] + ds * Math.sin(a)]); }
  const gx = q[n][0] - q[0][0], gy = q[n][1] - q[0][1]; console.log('closure gap', gx.toFixed(3), gy.toFixed(3));
  dense = q.slice(0, n).map((p, i) => [p[0] - gx * i / n, p[1] - gy * i / n]); }
const { out: rs, L: L2 } = resample(dense, 11);
const M = rs.length;
if (process.env.DBG) { const res = rs.map(p => { let m = 1e9; for (const d of discs) { const v = Math.hypot(p[0] - d[0], p[1] - d[1]) - d[2]; if (v < m) m = v; } return m; });
  console.log('RES', rs.map((p, i) => `${p[0].toFixed(0)},${p[1].toFixed(0)}:${res[i].toFixed(2)}`).join(' ')); }
// ---- geometry measures for placement
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, A = 0, cx = 0, cy = 0;
for (const p of dense) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
for (let i = 0; i < N; i++) { const a = dense[i], b = dense[(i + 1) % N], c = a[0] * b[1] - b[0] * a[1]; A += c; cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c; }
A /= 2; cx /= 6 * A; cy /= 6 * A;
console.log('bbox', minX.toFixed(1), maxX.toFixed(1), minY.toFixed(1), maxY.toFixed(1), 'centroid', cx.toFixed(1), cy.toFixed(1), 'nodes', M);
// ---- dot (local coords): along arm end direction beyond tip
const dl = Math.hypot(...arm.dirTip), u = arm.dirTip.map(v => v / dl);
const rTip = P.arm.rN + P.arm.bulb;
const dotC = [arm.tip[0] + u[0] * (rTip + P.gap + P.dotR), arm.tip[1] + u[1] * (rTip + P.gap + P.dotR)];
console.log('arm angle deg', (Math.atan2(-u[1], u[0]) * 180 / Math.PI).toFixed(1), 'dot', dotC.map(v => v.toFixed(1)));
// ---- write
const f2 = v => v.toFixed(2);
const build = (scale, shiftX, shiftY) => {
  const T = p => [p[0] * scale + shiftX, p[1] * scale + shiftY];
  const q = rs.map(T); let d = `M${f2(q[0][0])} ${f2(q[0][1])}`;
  for (let i = 0; i < M; i++) { const p0 = q[(i + M - 1) % M], p1 = q[i], p2 = q[(i + 1) % M], p3 = q[(i + 2) % M];
    d += `C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`; }
  const dc = T(dotC); return { d: d + 'Z', dot: dc, dr: P.dotR * scale };
};
const bboxCx = (minX + maxX) / 2, optCx = bboxCx * 0.85 + cx * 0.15, bboxCy = (minY + maxY) / 2;
// tile: scale 1, optical centre = mean of bbox centre and centroid
const t1 = build(1, 512 - optCx + P.nudge.x, 512 - bboxCy + P.nudge.y);
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<rect id="c07-tile" width="1024" height="1024" rx="232" fill="#0B0C0E"/>
<path id="c07-k" d="${t1.d}" fill="#FFFFFF"/>
<circle id="c07-dot" cx="${f2(t1.dot[0])}" cy="${f2(t1.dot[1])}" r="${f2(t1.dr)}" fill="#F2C04E"/>
</svg>
`;
const s2 = 700 / (maxY - minY);
const t2 = build(s2, 512 - optCx * s2 - 8, 512 - bboxCy * s2 + 6);
const free = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<path id="c07-k" d="${t2.d}" fill="#FFFFFF"/>
<circle id="c07-dot" cx="${f2(t2.dot[0])}" cy="${f2(t2.dot[1])}" r="${f2(t2.dr)}" fill="#F2C04E"/>
</svg>
`;
fs.writeFileSync(new URL('../svg/07-liquid-k-v2.svg', import.meta.url), tile);
fs.writeFileSync(new URL('../svg/07-liquid-k-v2-free.svg', import.meta.url), free);
console.log('tile dot', t1.dot.map(f2), 'free dot', t2.dot.map(f2), 'bytes', tile.length);
