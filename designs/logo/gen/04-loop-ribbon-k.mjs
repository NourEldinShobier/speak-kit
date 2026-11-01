// Generates designs/logo/svg/04-loop-ribbon-k.svg : cursive K from a loop ribbon (r05 language).
import { writeFileSync } from "node:fs";
const W = 84;
const n = (v) => +v.toFixed(2);
// anchors: [x, y, tx, ty] ; tangent direction (normalised), handle length = frac * chord
const N = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const arm = [
  [752, 226, ...N([-0.5, 1])],
  [540, 512, ...N([-1, 0.9])],      // X1 first pass (under)
  [410, 656, ...N([-1, 0.1])],      // loop bottom
  [330, 528, ...N([0, -1])],        // loop left (kisses stem)
  [418, 398, ...N([1, 0.12])],      // loop top
  [540, 512, ...N([1, 0.9])],       // X2 second pass (over)
  [650, 622, ...N([1, 0.9])],
  [738, 726, ...N([0.55, 1])],
  [776, 812, ...N([0.1, 1])],
];
const K = 0.38;
function segs(a) {
  const out = [];
  for (let i = 0; i < a.length - 1; i++) {
    const [x0, y0, a0, b0] = a[i], [x1, y1, a1, b1] = a[i + 1];
    const d = Math.hypot(x1 - x0, y1 - y0) * K;
    out.push([[x0, y0], [x0 + a0 * d, y0 + b0 * d], [x1 - a1 * d, y1 - b1 * d], [x1, y1]]);
  }
  return out;
}
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
function split(s, t) {
  const [a, b, c, d] = s, ab = lerp(a, b, t), bc = lerp(b, c, t), cd = lerp(c, d, t), abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t), m = lerp(abc, bcd, t);
  return [[a, ab, abc, m], [m, bcd, cd, d]];
}
const P = (p) => `${n(p[0])} ${n(p[1])}`;
const toD = (ss) => `M${P(ss[0][0])}` + ss.map((s) => `C${P(s[1])} ${P(s[2])} ${P(s[3])}`).join("");
const S = segs(arm);
const full = toD(S);
// under overlay: end of seg0 (last 40%) + start of seg1 (first 35%)
const u0 = split(S[0], 0.58)[1], u1 = split(S[1], 0.4)[0];
const under = toD([u0, u1]);
const stem = `M244 218V806`;
const gr = `x1="236" y1="214" x2="800" y2="826"`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c04-grad" gradientUnits="userSpaceOnUse" ${gr}>
<stop offset="0" stop-color="#7FE5C4"/><stop offset="0.3" stop-color="#4A9EFF"/><stop offset="0.62" stop-color="#0078D4"/><stop offset="1" stop-color="#6B3BFF"/>
</linearGradient>
<linearGradient id="c04-under" gradientUnits="userSpaceOnUse" x1="620" y1="420" x2="460" y2="580">
<stop offset="0" stop-color="#0B0C0E" stop-opacity="0"/><stop offset="0.5" stop-color="#0B0C0E" stop-opacity="0.5"/><stop offset="1" stop-color="#0B0C0E" stop-opacity="0"/>
</linearGradient>
</defs>
<g transform="translate(TX TY)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${W}">
<path d="${stem}" stroke="url(#c04-grad)"/>
<path d="${full}" stroke="url(#c04-grad)"/>
<path d="${under}" stroke="url(#c04-under)" stroke-linecap="butt"/>
<path d="${toD(S.slice(4))}" stroke="url(#c04-grad)"/>
</g>
</svg>
`;
// bbox -> centre
const xs = [], ys = [];
for (const s of S) for (let t = 0; t <= 1; t += 0.02) { const [a,b,c,d]=s,m=(q)=>[0,1,2,3].map(()=>0); const u=1-t; xs.push(u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0]); ys.push(u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]); }
xs.push(244); ys.push(218, 806);
const x0 = Math.min(...xs) - W / 2, x1 = Math.max(...xs) + W / 2, y0 = Math.min(...ys) - W / 2, y1 = Math.max(...ys) + W / 2;
console.log("bbox", n(x1 - x0), n(y1 - y0));
writeFileSync(new URL("../svg/04-loop-ribbon-k.svg", import.meta.url), svg.replace("TX TY", `${n(512 - (x0 + x1) / 2)} ${n(512 - (y0 + y1) / 2)}`));
