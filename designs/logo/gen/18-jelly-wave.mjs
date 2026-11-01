import { writeFileSync } from "node:fs";
const X0 = 222, X1 = 802, W = 112, R = W / 2, DY = +40;
const g = (x, c, s) => Math.exp(-(((x - c) / s) ** 2));
const y = (x) => 585 - 215 * g(x, 408, 104) - 105 * g(x, 646, 82) + DY;
const N = 30;
const P = [];
for (let i = 0; i <= N; i++) {
  const x = X0 + ((X1 - X0) * i) / N, h = 0.01;
  const dy = (y(x + h) - y(x - h)) / (2 * h), l = Math.hypot(1, dy);
  P.push({ x, y: y(x), nx: dy / l, ny: -1 / l }); // normal pointing up
}
const off = (d, f = () => 1) => P.map((p, i) => { const k = d * f(i / N); return [p.x + p.nx * k, p.y + p.ny * k]; });
const f1 = (n) => n.toFixed(1);
// Catmull-Rom -> cubic (G1)
const cr = (pts) => { let s = ""; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
  s += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`; } return s; };
const M = (p) => `M${f1(p[0])} ${f1(p[1])}`, L = (p) => `L${f1(p[0])} ${f1(p[1])}`;
const up = off(R), lo = off(-R);
const ribbon = M(up[0]) + cr(up) + `A${R} ${R} 0 0 1 ${f1(lo[N][0])} ${f1(lo[N][1])}` + cr([...lo].reverse()) + `A${R} ${R} 0 0 1 ${f1(up[0][0])} ${f1(up[0][1])}Z`;
// strip between offsets a..b (fractions along, tapered at ends)
const taper = (a) => (t) => Math.min(1, Math.sin(Math.PI * Math.min(t * 1, 1)) ** 0.5 * 1.0) * (t < 0.04 || t > 0.96 ? 0 : 1) || 0;
const strip = (a, b, tp) => { const A = off(a, tp), B = off(b, tp).reverse(); return M(A[0]) + cr(A) + L(B[0]) + cr(B) + "Z"; };
const tp = (t) => Math.max(0.0001, Math.min(1, Math.sin(Math.PI * t) * 1.6));
const hi = strip(R * 0.50, R * 0.82, (t) => Math.min(1, tp(t))), hi2 = strip(R * 0.60, R * 0.76, (t) => Math.max(0.0001, Math.sin(Math.PI * t) ** 3));
const shade = strip(-R * 0.1, -R * 1.3, (t) => Math.max(0.0001, Math.min(1, Math.sin(Math.PI * t) * 3)));
// rim light on bottom edge
const rim = strip(-R * 0.82, -R * 0.97, tp);
// shadow: ribbon translated down, flattened
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c18-tile" gradientUnits="userSpaceOnUse" x1="512" y1="0" x2="512" y2="1024"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F3F3F5"/></linearGradient>
<linearGradient id="c18-edge" gradientUnits="userSpaceOnUse" x1="512" y1="0" x2="512" y2="1024"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E5E5E7"/></linearGradient>
<linearGradient id="c18-jelly" gradientUnits="userSpaceOnUse" x1="${X0}" y1="330" x2="${X1}" y2="640"><stop offset="0" stop-color="#4A9EFF"/><stop offset="0.5" stop-color="#2B8CF0"/><stop offset="1" stop-color="#0078D4"/></linearGradient>
<linearGradient id="c18-depth" gradientUnits="userSpaceOnUse" x1="0" y1="290" x2="0" y2="660"><stop offset="0" stop-color="#8FCBFF" stop-opacity="0.35"/><stop offset="0.5" stop-color="#4A9EFF" stop-opacity="0"/><stop offset="1" stop-color="#005BB0" stop-opacity="0.35"/></linearGradient>
<linearGradient id="c18-shade" gradientUnits="userSpaceOnUse" x1="0" y1="330" x2="0" y2="670"><stop offset="0" stop-color="#0060C0" stop-opacity="0.15"/><stop offset="1" stop-color="#004A9E" stop-opacity="0.55"/></linearGradient>
<clipPath id="c18-clip"><path d="${ribbon}"/></clipPath>
<filter id="c18-soft" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="c18-shadow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="22"/></filter>
</defs>
<rect x="1" y="1" width="1022" height="1022" rx="232" fill="url(#c18-edge)"/>
<rect x="4" y="4" width="1016" height="1016" rx="229" fill="url(#c18-tile)"/>
<g transform="translate(0 52)"><path d="${ribbon}" fill="#0E58A8" opacity="0.32" filter="url(#c18-shadow)" transform="translate(0 40) scale(1 0.9) translate(0 36)"/></g>
<path d="${ribbon}" fill="url(#c18-jelly)"/>
<path d="${ribbon}" fill="url(#c18-depth)"/>
<g clip-path="url(#c18-clip)"><path d="${shade}" fill="url(#c18-shade)" filter="url(#c18-soft)"/><path d="${rim}" fill="#9DD3FF" opacity="0.5" filter="url(#c18-soft)"/></g>
<path d="${hi}" fill="#FFFFFF" opacity="0.55" filter="url(#c18-soft)"/>
<path d="${hi2}" fill="#FFFFFF" opacity="0.65"/>
</svg>`;
writeFileSync(new URL("../svg/18-jelly-wave.svg", import.meta.url), svg);
let mn = 1e9, mx = -1e9; up.concat(lo).forEach((p) => { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); }); console.log("y range", mn - R * 0, mx);
