// Liquid K: variable-radius strokes (disc sweeps) smooth-unioned as an SDF, contour traced, fitted with G1 cubics.
import fs from 'node:fs';
const P = {
  stemX: 342, top: 252, bot: 772, r0: 30, r1: 50, sig: 0.25,
  arm: { p0: [379, 520], p1: [515, 425], p2: [662, 292], ra: 52, rb: 33, bulb: 0 },
  leg: { p0: [379, 505], p1: [520, 610], p2: [678, 737], ra: 54, rb: 35, bulb: 0 },
  k: 52, dot: { c: [756, 226], r: 25 },
};
const discs = (pts, rf) => pts.map((p, i) => [p[0], p[1], rf(i / (pts.length - 1))]);
const N = 360;
const stem = discs(Array.from({ length: N + 1 }, (_, i) => [P.stemX, P.top + P.r0 + (P.bot - P.top - 2 * P.r0) * i / N]),
  t => P.r0 + (P.r1 - P.r0) / (1 + ((t - 0.5) / P.sig) ** 2) ** 1.5);
const bez = (a, b, c, t) => [0, 1].map(i => (1 - t) ** 2 * a[i] + 2 * (1 - t) * t * b[i] + t * t * c[i]);
const stroke = s => discs(Array.from({ length: N + 1 }, (_, i) => bez(s.p0, s.p1, s.p2, i / N)),
  t => s.rb + (s.ra - s.rb) * (1 - t) ** 1.3 + s.bulb * Math.exp(-(((t - 1) / 0.12) ** 2)));
const parts = [stem, stroke(P.arm), stroke(P.leg)];
const dPart = (d, x, y) => { let m = 1e9; for (const [cx, cy, r] of d) { const v = Math.hypot(x - cx, y - cy) - r; if (v < m) m = v; } return m; };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
const sdf = (x, y) => smin(smin(dPart(parts[0], x, y), dPart(parts[1], x, y), P.k), dPart(parts[2], x, y), P.k);
// grid
const x0 = 250, x1 = 740, y0 = 230, y1 = 795, g = 0.5;
const W = Math.ceil((x1 - x0) / g) + 1, H = Math.ceil((y1 - y0) / g) + 1;
const F = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) F[j * W + i] = sdf(x0 + i * g, y0 + j * g);
// marching squares segments
const segs = new Map(); // key -> [points]
const key = (p) => p.id;
const lerp = (a, b, fa, fb) => a + (b - a) * (fa / (fa - fb));
const adj = new Map();
const link = (a, b) => { for (const [p, q] of [[a, b], [b, a]]) { const k = key(p); if (!adj.has(k)) adj.set(k, { p, n: [] }); adj.get(k).n.push(key(q)); if (!adj.has(key(q))) adj.set(key(q), { p: q, n: [] }); } };
for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
  const f = [F[j * W + i], F[j * W + i + 1], F[(j + 1) * W + i + 1], F[(j + 1) * W + i]];
  const X = x0 + i * g, Y = y0 + j * g;
  const e = [ // edges: top, right, bottom, left
    () => Object.assign([lerp(X, X + g, f[0], f[1]), Y], { id: `h${i},${j}` }), () => Object.assign([X + g, lerp(Y, Y + g, f[1], f[2])], { id: `v${i + 1},${j}` }),
    () => Object.assign([lerp(X, X + g, f[3], f[2]), Y + g], { id: `h${i},${j + 1}` }), () => Object.assign([X, lerp(Y, Y + g, f[0], f[3])], { id: `v${i},${j}` })];
  let c = 0; f.forEach((v, n) => { if (v < 0) c |= 1 << n; });
  const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]] };
  if (c === 5) { for (const s of [[3, 0], [1, 2]]) link(e[s[0]](), e[s[1]]()); continue; }
  if (c === 10) { for (const s of [[0, 1], [2, 3]]) link(e[s[0]](), e[s[1]]()); continue; }
  for (const s of T[c] || []) link(e[s[0]](), e[s[1]]());
}
// walk the longest loop
const seen = new Set(); let loop = [];
for (const st of adj.keys()) { if (seen.has(st)) continue; const lp = [adj.get(st).p]; seen.add(st); let prev = null, cur = st;
  for (;;) { const n = adj.get(cur).n.find(k => k !== prev && (!seen.has(k) || k === st)); if (n === undefined || n === st) break; prev = cur; cur = n; seen.add(cur); lp.push(adj.get(cur).p); }
  if (lp.length > loop.length) loop = lp; }
console.log('loop pts', loop.length);
// smooth + resample
let pts = loop;
for (let it = 0; it < 20; it++) pts = pts.map((p, i) => { const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; });
const cum = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1])); }
const L = cum[cum.length - 1], M = Math.round(L / 10);
const rs = []; let k = 0;
for (let m = 0; m < M; m++) { const s = L * m / M; while (cum[k + 1] < s) k++; const t = (s - cum[k]) / (cum[k + 1] - cum[k]); const a = pts[k], b = pts[(k + 1) % pts.length]; rs.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
// Catmull-Rom -> cubic
const f1 = v => v.toFixed(2);
let d = `M${f1(rs[0][0])} ${f1(rs[0][1])}`;
for (let i = 0; i < M; i++) {
  const p0 = rs[(i + M - 1) % M], p1 = rs[i], p2 = rs[(i + 1) % M], p3 = rs[(i + 2) % M];
  d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
}
d += 'Z';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<rect id="c07-tile" width="1024" height="1024" rx="232" fill="#0B0C0E"/>
<path id="c07-k" d="${d}" fill="#FFFFFF"/>
<circle id="c07-dot" cx="${P.dot.c[0]}" cy="${P.dot.c[1]}" r="${P.dot.r}" fill="#F2C04E"/>
</svg>
`;
fs.writeFileSync(new URL('../svg/07-liquid-k.svg', import.meta.url), svg);
console.log('nodes', M, 'bytes', svg.length);
