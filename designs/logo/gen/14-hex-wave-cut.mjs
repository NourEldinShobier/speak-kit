import { writeFileSync } from 'node:fs';
const P = { // tweakable
  cx: 512, cy: 512, R: 320, r: 70,
  x0: 326, A: 54, lam: 312, half: 32, dotX: 2, dotR: 22,
};
const f = v => +v.toFixed(2);
const W = P.R * Math.sqrt(3) / 2, XR = P.cx + W, XL = P.cx - W;
const V = [[XR, P.cy - P.R / 2], [P.cx, P.cy - P.R], [XL, P.cy - P.R / 2], [XL, P.cy + P.R / 2], [P.cx, P.cy + P.R], [XR, P.cy + P.R / 2]]; // UR,T,UL,LL,B,LR
// wave
const w = 2 * Math.PI / P.lam;
const yc = x => P.cy - P.A * Math.sin(w * (x - P.x0));
const dy = x => -P.A * w * Math.cos(w * (x - P.x0));
const nrm = x => { const m = Math.hypot(dy(x), 1); return [-dy(x) / m, 1 / m]; };
const Q = (x, s) => { const n = nrm(x); return [x + s * P.half * n[0], yc(x) + s * P.half * n[1]]; };
const dQ = (x, s) => { const h = 1e-3, a = Q(x - h, s), b = Q(x + h, s); return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)]; };
function xcross(s) { let lo = P.x0, hi = XR + 80; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; Q(m, s)[0] < XR ? lo = m : hi = m; } return lo; }
// edge as cubic list from param a to b (hermite -> bezier)
function edge(s, a, b, n) {
  const out = []; const xs = Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
  for (let i = 0; i < n; i++) {
    const p0 = Q(xs[i], s), p1 = Q(xs[i + 1], s), d0 = dQ(xs[i], s), d1 = dQ(xs[i + 1], s), h = (xs[i + 1] - xs[i]) / 3;
    out.push([[p0[0] + d0[0] * h, p0[1] + d0[1] * h], [p1[0] - d1[0] * h, p1[1] - d1[1] * h], p1]);
  }
  return out;
}
const xe = { u: xcross(-1), l: xcross(1) };
const E1 = Q(xe.u, -1), E2 = Q(xe.l, 1);
E1[0] = XR; E2[0] = XR;
const nSeg = 9;
const lowerEdge = edge(1, xe.l, P.x0, nSeg); // runs right->left (negative step is fine)
const upperEdge = edge(-1, P.x0, xe.u, nSeg);
// cap
const C = [P.x0, yc(P.x0)], tl = Math.hypot(1, dy(P.x0)), t = [1 / tl, dy(P.x0) / tl], n = nrm(P.x0), r = P.half, k = 0.5523 * r;
const L0 = [C[0] + r * n[0], C[1] + r * n[1]], B = [C[0] - r * t[0], C[1] - r * t[1]], U0 = [C[0] - r * n[0], C[1] - r * n[1]];
const cap = [
  [[L0[0] - k * t[0], L0[1] - k * t[1]], [B[0] + k * n[0], B[1] + k * n[1]], B],
  [[B[0] - k * n[0], B[1] - k * n[1]], [U0[0] - k * t[0], U0[1] - k * t[1]], U0]];
// rounded hex corners
const d = P.r / Math.tan(Math.PI / 3), kk = 4 / 3 * Math.tan(Math.PI / 12) * P.r * Math.tan(Math.PI / 3) / Math.tan(Math.PI / 3);
const kc = 4 / 3 * Math.tan(Math.PI / 12) * P.r; // arc 60deg turn
let seg = `M${f(E1[0])} ${f(E1[1])}`;
const pt = ([x, y]) => `${f(x)} ${f(y)}`;
const dirs = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
for (let i = 0; i < 6; i++) {
  const v = V[i], prev = V[(i + 5) % 6], next = V[(i + 1) % 6];
  const din = dirs(prev, v), dout = dirs(v, next);
  const a = [v[0] - din[0] * d, v[1] - din[1] * d], b = [v[0] + dout[0] * d, v[1] + dout[1] * d];
  // travel order is UR,T,UL,LL,B,LR (counter-clockwise on screen) starting from E1 on the UR vertex's incoming edge
  seg += ` L${pt(a)} C${pt([a[0] + din[0] * kc, a[1] + din[1] * kc])} ${pt([b[0] - dout[0] * kc, b[1] - dout[1] * kc])} ${pt(b)}`;
}
seg += ` L${pt(E2)}`;
for (const c of lowerEdge) seg += ` C${pt(c[0])} ${pt(c[1])} ${pt(c[2])}`;
for (const c of cap) seg += ` C${pt(c[0])} ${pt(c[1])} ${pt(c[2])}`;
for (const c of upperEdge) seg += ` C${pt(c[0])} ${pt(c[1])} ${pt(c[2])}`;
seg += ' Z';
// E1 sits on the right edge below UR; first corner processed must be UR, with its incoming edge from LR->UR (E2 side). fine since path starts on that edge.
const crestX = P.x0 + P.lam * (0.25 + P.dotX - 1), dot = [crestX, yc(crestX)];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><linearGradient id="c14-grad" gradientUnits="userSpaceOnUse" x1="${f(XL + 40)}" y1="${f(V[4][1] - 20)}" x2="${f(XR - 40)}" y2="${f(V[1][1] + 20)}"><stop offset="0" stop-color="#0078D4"/><stop offset="0.5" stop-color="#4A9EFF"/><stop offset="1" stop-color="#4DE6E0"/></linearGradient></defs>
<path id="c14-hex" fill="url(#c14-grad)" d="${seg}"/>
<circle id="c14-dot" cx="${f(dot[0])}" cy="${f(dot[1])}" r="${P.dotR}" fill="#F2C04E"/>
</svg>
`;
writeFileSync(new URL('../svg/14-hex-wave-cut.svg', import.meta.url), svg);
console.log('ok', f(E1[1]), f(E2[1]), dot.map(f));
