// Generator for 03-loop-ribbon-s: Hermite waypoints -> G1 cubic Beziers, one self-crossing with an underpass.
import { writeFileSync } from "node:fs";
const W = 68;
// [x, y, dirx, diry, k(handle factor for the segment leaving this point)]
const WP = [
  [345, 640, 0.1, -1, 0.38],
  [355, 480, 0, -1, 0.40],
  [285, 375, -1, 0, 0.42],
  [195, 475, 0, 1, 0.42],
  [275, 575, 1, 0, 0.40],
  [395, 500, 0.55, -0.85, 0.40],
  [500, 335, 1, 0, 0.42],
  [610, 455, 0.15, 1, 0.42],
  [705, 595, 1, 0, 0.46],
  [800, 450, 0.15, -1, 0.42],
  [895, 200, 1, 0, 0.42],
  [985, 330, 0.04, 1, 0.38],
  [990, 700, 0, 1, 0.38],
];
const norm = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
let segs = [];
for (let i = 0; i < WP.length - 1; i++) {
  const [x0, y0, a0, b0, k] = WP[i], [x1, y1, a1, b1] = WP[i + 1];
  const d = Math.hypot(x1 - x0, y1 - y0) * k;
  const t0 = norm([a0, b0]), t1 = norm([a1, b1]);
  segs.push([[x0, y0], [x0 + t0[0] * d, y0 + t0[1] * d], [x1 - t1[0] * d, y1 - t1[1] * d], [x1, y1]]);
}
// fit: centerline bbox -> center on 512,512, longest side (with stroke) ~ 730
const bez = (s, t) => { const u = 1 - t; return [0, 1].map((c) => u*u*u*s[0][c] + 3*u*u*t*s[1][c] + 3*u*t*t*s[2][c] + t*t*t*s[3][c]); };
const sample = () => { const p = []; segs.forEach((s, i) => { for (let j = 0; j < 200; j++) p.push({ g: i + j / 200, p: bez(s, j / 200) }); }); p.push({ g: segs.length, p: segs.at(-1)[3] }); return p; };
let pts = sample();
const bb = (pts) => ({ x0: Math.min(...pts.map(q => q.p[0])), x1: Math.max(...pts.map(q => q.p[0])), y0: Math.min(...pts.map(q => q.p[1])), y1: Math.max(...pts.map(q => q.p[1])) });
let b = bb(pts);
const sc = (730 - W) / Math.max(b.x1 - b.x0, b.y1 - b.y0);
const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
segs = segs.map(s => s.map(([x, y]) => [512 + (x - cx) * sc, 512 + (y - cy) * sc]));
pts = sample(); b = bb(pts);
// self intersection
let hit = null;
for (let i = 0; i < pts.length - 1 && !hit; i++) for (let j = i + 40; j < pts.length - 1; j++) {
  const [p, q, r, s] = [pts[i].p, pts[i + 1].p, pts[j].p, pts[j + 1].p];
  const d1 = [q[0]-p[0], q[1]-p[1]], d2 = [s[0]-r[0], s[1]-r[1]];
  const den = d1[0]*d2[1] - d1[1]*d2[0]; if (Math.abs(den) < 1e-9) continue;
  const t = ((r[0]-p[0])*d2[1] - (r[1]-p[1])*d2[0]) / den, u = ((r[0]-p[0])*d1[1] - (r[1]-p[1])*d1[0]) / den;
  if (t >= 0 && t < 1 && u >= 0 && u < 1) { hit = { g1: pts[i].g + t / 200, g2: pts[j].g + u / 200, at: [p[0]+t*d1[0], p[1]+t*d1[1]] }; break; }
}
// arclength-based param offsets around g2
const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i-1] + Math.hypot(pts[i].p[0]-pts[i-1].p[0], pts[i].p[1]-pts[i-1].p[1]));
const idxOf = (g) => Math.round((g / segs.length) * (pts.length - 1)) ; // approx; refine below
const gAt = (g) => { let k = 0; while (k < pts.length - 1 && pts[k].g < g) k++; return k; };
const k2 = gAt(hit.g2);
const UL = +process.env.UL || 135;
let ka = k2; while (ka > 0 && cum[k2] - cum[ka] < UL) ka--;
let kb = k2; while (kb < pts.length - 1 && cum[kb] - cum[k2] < UL) kb++;
const u0 = pts[ka].g, u1 = pts[kb].g;
// sub-curve over global param [a,c]
const split = (s, t) => { const L = (a, b2, t) => a.map((_, i) => a[i] + (b2[i] - a[i]) * t);
  const [p0, p1, p2, p3] = s, a = L(p0, p1, t), bq = L(p1, p2, t), c = L(p2, p3, t), d = L(a, bq, t), e = L(bq, c, t), f = L(d, e, t);
  return [[p0, a, d, f], [f, e, c, p3]]; };
const sub = (ga, gc) => { const out = [];
  for (let i = Math.floor(ga); i <= Math.min(Math.floor(gc), segs.length - 1); i++) {
    let s = segs[i], lo = Math.max(ga - i, 0), hi = Math.min(gc - i, 1); if (hi - lo < 1e-9) continue;
    if (hi < 1) s = split(s, hi)[0];
    if (lo > 0) s = split(s, lo / hi)[1];
    out.push(s); }
  return out; };
const f = (n) => n.toFixed(2);
const d = (ss) => `M${f(ss[0][0][0])} ${f(ss[0][0][1])}` + ss.map(s => `C${f(s[1][0])} ${f(s[1][1])} ${f(s[2][0])} ${f(s[2][1])} ${f(s[3][0])} ${f(s[3][1])}`).join("");
// gradient (horizontal, userSpace)
const gx0 = b.x0 - W / 2, gx1 = b.x1 + W / 2;
const STOPS = [[0, "#7FE5C4"], [0.27, "#4DE6E0"], [0.52, "#4A9EFF"], [0.76, "#0078D4"], [1, "#6B3BFF"]];
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, bb2, t) => a.map((v, i) => Math.round(v + (bb2[i] - v) * t));
const toHex = (c) => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
const colAt = (t) => { for (let i = 0; i < STOPS.length - 1; i++) if (t <= STOPS[i+1][0]) { const [ta, ca] = STOPS[i], [tb, cb] = STOPS[i+1]; return mix(hex(ca), hex(cb), (t - ta) / (tb - ta)); } return hex(STOPS.at(-1)[1]); };
// underpass gradient over its own x range: darker + translucent in the middle
const uxa = Math.min(pts[ka].p[0], pts[kb].p[0]), uxb = Math.max(pts[ka].p[0], pts[kb].p[0]);
const ustops = []; for (let i = 0; i <= 8; i++) { const u = i / 8, x = uxa + (uxb - uxa) * u, w = Math.sin(Math.PI * u) ** 1.2;
  const c = mix(colAt((x - gx0) / (gx1 - gx0)), [11, 40, 70], 0.5 * w);
  ustops.push(`<stop offset="${u.toFixed(3)}" stop-color="${toHex(c)}" stop-opacity="${(1 - 0.4 * w).toFixed(2)}"/>`); }
const pad = 6;
const A = sub(0, u0), U = sub(Math.max(0, u0 - 0.02), Math.min(segs.length, u1 + 0.02)), B = sub(u1, segs.length);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c03-grad" gradientUnits="userSpaceOnUse" x1="${f(gx0)}" y1="0" x2="${f(gx1)}" y2="0">${STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>
<linearGradient id="c03-under" gradientUnits="userSpaceOnUse" x1="${f(uxa)}" y1="0" x2="${f(uxb)}" y2="0">${ustops.join("")}</linearGradient>
</defs>
<g fill="none" stroke-width="${W}" stroke-linejoin="round">
<path d="${d(U)}" stroke="url(#c03-under)" stroke-linecap="butt"/>
<path d="${d(A)}" stroke="url(#c03-grad)" stroke-linecap="butt"/>
<path d="${d(B)}" stroke="url(#c03-grad)" stroke-linecap="butt"/>
<circle cx="${f(segs[0][0][0])}" cy="${f(segs[0][0][1])}" r="${W/2}" fill="${toHex(colAt((segs[0][0][0]-gx0)/(gx1-gx0)))}" stroke="none"/>
<circle cx="${f(segs.at(-1)[3][0])}" cy="${f(segs.at(-1)[3][1])}" r="${W/2}" fill="${toHex(colAt((segs.at(-1)[3][0]-gx0)/(gx1-gx0)))}" stroke="none"/>
</g>
</svg>
`;
writeFileSync(new URL("../svg/03-loop-ribbon-s.svg", import.meta.url), svg);
console.log("bbox", b, "hit", hit.at.map(f), "u", u0.toFixed(2), u1.toFixed(2));
