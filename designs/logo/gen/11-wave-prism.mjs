import { writeFileSync } from "node:fs";
const S = 3.2, DX = -26, DY = -58; // ref-space (316px) -> 1024
const P = ([x, y]) => [x * S + DX, y * S + DY];
const f = (n) => +n.toFixed(2);
const pt = (p) => { const q = P(p); return `${f(q[0])} ${f(q[1])}`; };
const K = 0.5523;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const unit = (v) => [v[0] / len(v), v[1] / len(v)];
const mv = (p, u, d) => [p[0] + u[0] * d, p[1] + u[1] * d];
// rounded polygon; verts = [{p, r}], optional mid(i) returns path segment string between cut end of corner i and cut start of corner i+1
function corners(verts) {
  const n = verts.length;
  return verts.map((v, i) => {
    const a = verts[(i + n - 1) % n].p, b = verts[(i + 1) % n].p;
    const ua = unit(sub(a, v.p)), ub = unit(sub(b, v.p));
    const ang = Math.acos(ua[0] * ub[0] + ua[1] * ub[1]);
    const d = v.r / Math.tan(ang / 2);
    return { in: mv(v.p, ua, d), out: mv(v.p, ub, d), v: v.p, d };
  });
}
function roundPath(verts, mids = {}) {
  const c = corners(verts), n = c.length;
  let s = `M${pt(c[0].out)}`;
  for (let i = 1; i <= n; i++) {
    const k = i % n, prev = c[(i - 1) % n];
    s += mids[i - 1] ? mids[i - 1](prev.out, c[k].in) : `L${pt(c[k].in)}`;
    const h = (1 - K);
    s += `C${pt(mv(c[k].in, sub(c[k].v, c[k].in), 1 - h + 0))}`; // placeholder replaced below
  }
  return s;
}
// explicit version (clear control math)
function build(verts, mids = {}) {
  const c = corners(verts), n = c.length;
  let s = `M${pt(c[0].out)}`;
  for (let i = 1; i <= n; i++) {
    const k = i % n, pv = c[(i - 1) % n];
    s += mids[(i - 1) % n] ? mids[(i - 1) % n](pv.out, c[k].in) : `L${pt(c[k].in)}`;
    const cc = c[k];
    const c1 = mv(cc.in, sub(cc.v, cc.in), K), c2 = mv(cc.out, sub(cc.v, cc.out), K);
    s += `C${pt(c1)} ${pt(c2)} ${pt(cc.out)}`;
  }
  return s + "Z";
}
const sil = build([
  { p: [166, 52], r: 20 },   // apex
  { p: [276, 214], r: 32 },  // right
  { p: [174, 292], r: 46 },  // bottom (convex base)
  { p: [58, 216], r: 32 },   // left
]);
// facet with S-wave right edge (vertical tangents at anchors)
const X0 = 166;
const wave = (a, b) => {
  const H = b[1] - a[1], x = a[0];
  const A = [x, a[1]], B = [x + 9, a[1] + H * 0.3], C = [x - 9, a[1] + H * 0.7], D = [b[0], b[1]];
  const seg = (p, q) => { const m = (q[1] - p[1]) * 0.5; return `C${pt([p[0], p[1] + m])} ${pt([q[0], q[1] - m])} ${pt(q)}`; };
  return `L${pt(A)}` + seg(A, B) + seg(B, C) + seg(C, D);
};
const facet = build([
  { p: [X0, 94], r: 12 },
  { p: [X0, 268], r: 14 },
  { p: [74, 208], r: 16 },
], { 0: wave });
const g = (x) => f(x * S + DY);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c11-grad" gradientUnits="userSpaceOnUse" x1="512" y1="${g(100)}" x2="512" y2="${g(268)}">
<stop offset="0" stop-color="#F2C04E"/><stop offset="0.24" stop-color="#D9C4A0"/><stop offset="0.42" stop-color="#6B7CFF"/><stop offset="0.7" stop-color="#3C9BF5"/><stop offset="1" stop-color="#2EC4F0"/>
</linearGradient>
</defs>
<rect width="1024" height="1024" rx="232" fill="#121212"/>
<path d="${sil}" fill="#FFFFFF"/>
<path d="${facet}" fill="url(#c11-grad)"/>
</svg>
`;
writeFileSync(new URL("../svg/11-wave-prism.svg", import.meta.url), svg);
