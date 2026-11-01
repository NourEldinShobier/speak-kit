import { writeFileSync } from "node:fs";
const f = (n) => +n.toFixed(2);
const P = (p) => `${f(p[0])} ${f(p[1])}`;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (v) => Math.hypot(v[0], v[1]);
const unit = (v) => mul(v, 1 / len(v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const polar = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
// clockwise (screen) arc a0->a1 (a1>a0) as cubic segments <=60deg
function arc(c, r, a0, a1) {
  const n = Math.ceil((a1 - a0) / (Math.PI / 3) - 1e-9), da = (a1 - a0) / n;
  const h = (4 / 3) * Math.tan(da / 4) * r; let s = "";
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * da, t1 = t0 + da;
    const p0 = polar(c, r, t0), p1 = polar(c, r, t1);
    const c1 = add(p0, mul([-Math.sin(t0), Math.cos(t0)], h)), c2 = sub(p1, mul([-Math.sin(t1), Math.cos(t1)], h));
    s += `C${P(c1)} ${P(c2)} ${P(p1)}`;
  }
  return s;
}
// corner of polygon at vertex v between prev and next with radius r -> {c, a0, a1, tin, tout}
function corner(prev, v, next, r) {
  const ua = unit(sub(prev, v)), ub = unit(sub(next, v));
  const ang = Math.acos(dot(ua, ub)), d = r / Math.tan(ang / 2);
  const tin = add(v, mul(ua, d)), tout = add(v, mul(ub, d));
  const bis = unit(add(ua, ub)), c = add(v, mul(bis, r / Math.sin(ang / 2)));
  let a0 = Math.atan2(tin[1] - c[1], tin[0] - c[0]), a1 = Math.atan2(tout[1] - c[1], tout[0] - c[0]);
  while (a1 < a0) a1 += 2 * Math.PI;
  return { c, r, a0, a1, tin, tout };
}
const PAR = { H: 650, lift: 8, rA: 70, rS: 90, rB: 150, rim: 18, rhoT: 38, rhoB: 46, amp: 42, wy0: 0, wy1: 0 };
const W = [[0, 0], [1.0, 0.68], [0, 1.0], [-1.0, 0.68]]; // A, R, B, L in units (x half-width rel, y rel) refined below
function shape(s) {
  const hw = 108 * s, ya = 0, ym = 163 * s, yb = 240 * s;
  const V = { A: [0, ya], R: [hw, ym], B: [0, yb], L: [-hw, ym] };
  const cs = { A: PAR.rA, R: PAR.rS, B: PAR.rB, L: PAR.rS };
  const order = ["A", "R", "B", "L"];
  const cn = order.map((k, i) => corner(V[order[(i + 3) % 4]], V[k], V[order[(i + 1) % 4]], cs[k]));
  let d = `M${P(cn[0].tout)}`;
  for (let i = 1; i <= 4; i++) { const c = cn[i % 4]; d += `L${P(c.tin)}` + arc(c.c, c.r, c.a0, c.a1); }
  // bbox by sampling arcs & extremes
  const pts = [];
  cn.forEach((c) => { for (let a = c.a0; a <= c.a1 + 1e-9; a += 0.01) pts.push(polar(c.c, c.r, a)); });
  const ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
  return { V, cn, d, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}
// fit scale so height = H
let lo = 0.5, hi = 4;
for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; const b = shape(m).bb; (b[3] - b[1] > PAR.H) ? (hi = m) : (lo = m); }
const s = (lo + hi) / 2, sh0 = shape(s);
const ty = 512 - PAR.lift - (sh0.bb[1] + sh0.bb[3]) / 2, tx = 512;
const T = (p) => [p[0] + tx, p[1] + ty];
// translate vertices and rebuild
const sh = shape(s);
const Vt = Object.fromEntries(Object.entries(sh.V).map(([k, v]) => [k, T(v)]));
function build(Vt) {
  const cs = { A: PAR.rA, R: PAR.rS, B: PAR.rB, L: PAR.rS }, order = ["A", "R", "B", "L"];
  const cn = order.map((k, i) => corner(Vt[order[(i + 3) % 4]], Vt[k], Vt[order[(i + 1) % 4]], cs[k]));
  let d = `M${P(cn[0].tout)}`;
  for (let i = 1; i <= 4; i++) { const c = cn[i % 4]; d += `L${P(c.tin)}` + arc(c.c, c.r, c.a0, c.a1); }
  return d + "Z";
}
const sil = build(Vt);
// facet
const inward = [512, (Vt.A[1] + Vt.B[1]) / 2];
function offLine(p, q, dist) {
  let n = unit([q[1] - p[1], -(q[0] - p[0])]);
  if (dot(n, sub(inward, p)) < 0) n = mul(n, -1);
  return { n, k: dot(n, p) + dist };
}
const l1 = offLine(Vt.A, Vt.L, PAR.rim), l2 = offLine(Vt.L, Vt.B, PAR.rim);
const inter = (a, b) => { const det = a.n[0] * b.n[1] - a.n[1] * b.n[0]; return [(a.k * b.n[1] - b.k * a.n[1]) / det, (a.n[0] * b.k - b.n[0] * a.k) / det]; };
const Lp = inter(l1, l2);
const along = (l, x) => (l.k - l.n[0] * x) / l.n[1]; // y on line at x
const dirUp1 = unit([l1.n[1], -l1.n[0]]);
// tip circle: centre x = 512 - rhoT, tangent to l1 (inner side)
const rt = PAR.rhoT, cT = [512 - rt, 0]; cT[1] = (l1.k + rt - l1.n[0] * cT[0]) / l1.n[1];
const rb = PAR.rhoB, cB = [512 - rb, 0]; cB[1] = (l2.k + rb - l2.n[0] * cB[0]) / l2.n[1];
const cL = corner(add(Lp, mul(unit([l1.n[1], -l1.n[0]]), 100)), Lp, add(Lp, mul(unit([l2.n[1], -l2.n[0]]), 100)), PAR.rS - PAR.rim);
// corner() needs prev/next along lines: build explicitly
function lineDirs() {
  const a = unit(sub(Vt.A, Vt.L)), b = unit(sub(Vt.B, Vt.L));
  return { prev: add(Lp, mul(a, 100)), next: add(Lp, mul(b, 100)) };
}
const dd = lineDirs();
const cl = corner(dd.next, Lp, dd.prev, PAR.rS - PAR.rim);
const angOf = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
const tT = sub(cT, mul(l1.n, rt)), tB = sub(cB, mul(l2.n, rb));
// wave from S=(512,cT.y) to E=(512,cB.y) with vertical tangents
const S0 = [512, cT[1]], E0 = [512, cB[1]];
const g = (t) => Math.sin(2 * Math.PI * t) * Math.sin(Math.PI * t);
const dg = (t) => 2 * Math.PI * Math.cos(2 * Math.PI * t) * Math.sin(Math.PI * t) + Math.PI * Math.sin(2 * Math.PI * t) * Math.cos(Math.PI * t);
let gmax = 0; for (let t = 0; t <= 1; t += 0.001) gmax = Math.max(gmax, Math.abs(g(t)));
const Hh = E0[1] - S0[1], N = 8; let wave = "";
for (let i = 0; i < N; i++) {
  const t0 = i / N, t1 = (i + 1) / N, dt = t1 - t0;
  const pt = (t) => [512 + (PAR.amp / gmax) * g(t), S0[1] + Hh * t];
  const dv = (t) => [(PAR.amp / gmax) * dg(t), Hh];
  const p0 = pt(t0), p1 = pt(t1), v0 = dv(t0), v1 = dv(t1);
  wave += `C${P(add(p0, mul(v0, dt / 3)))} ${P(sub(p1, mul(v1, dt / 3)))} ${P(p1)}`;
}
let a0 = angOf(cB, E0), a1 = angOf(cB, tB); while (a1 < a0) a1 += 2 * Math.PI;
let facet = `M${P(S0)}` + wave + arc(cB, rb, a0, a1) + `L${P(cl.tin)}` + arc(cl.c, cl.r, cl.a0, cl.a1) + `L${P(tT)}`;
let b0 = angOf(cT, tT), b1 = 2 * Math.PI; while (b0 > b1 - 1e-9 || b0 < b1 - 2 * Math.PI) b0 += b0 < b1 - 2 * Math.PI ? 2 * Math.PI : -2 * Math.PI;
facet += arc(cT, rt, b0, b1) + "Z";
const gy0 = cT[1] - rt, gy1 = cB[1] + rb;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c11-grad" gradientUnits="userSpaceOnUse" x1="512" y1="${f(gy0)}" x2="512" y2="${f(gy1)}">
<stop offset="0" stop-color="#F6DFA0"/><stop offset="0.2" stop-color="#F2C04E"/><stop offset="0.3" stop-color="#E6B9B4"/><stop offset="0.4" stop-color="#B9A6FF"/><stop offset="0.6" stop-color="#6B7CFF"/><stop offset="0.8" stop-color="#4A9EFF"/><stop offset="1" stop-color="#2EC4F0"/>
</linearGradient>
</defs>
<rect width="1024" height="1024" rx="232" fill="#121212"/>
<path d="${sil}" fill="#FFFFFF"/>
<path d="${facet}" fill="url(#c11-grad)"/>
</svg>
`;
writeFileSync(new URL("../svg/11-wave-prism-v2.svg", import.meta.url), svg);
console.log("bbox", sh.bb.map((v, i) => f(v + (i % 2 ? ty : tx))), "scale", s);
