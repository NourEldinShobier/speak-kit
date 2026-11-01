// Sparkle-wave: astroid-like four-point star, horizontal arms displaced by an odd sine (left dips, right crests).
import { writeFileSync } from "node:fs";
const P = { a: 304, b: 352, n: 3.8, A: 52, k: 1.05, w: 0.3, cx: 512, cy: 516 };
const f = (v) => v.toFixed(2);
const D = (x) => { const u = Math.min(1, Math.max(0, (Math.abs(x) - 80) / (P.a - 80))); return -Math.sign(x) * P.A * Math.sin(Math.PI * P.k * u) * u * u * (3 - 2 * u); };
const sg = (v) => Math.sign(v);
// point + derivative (central finite difference) wrt t
function raw(t) {
  const c = Math.cos(t), s = Math.sin(t), n = P.n;
  const x = P.a * sg(c) * Math.abs(c) ** n, y0 = P.b * sg(s) * Math.abs(s) ** n;
  const env = 1;
  return { x, y: y0 + D(x) * env };
}
function pt(t) {
  const e = 1e-5, p = raw(t), u = raw(t + e), l = raw(t - e);
  return { x: p.x, y: p.y, dx: (u.x - l.x) / (2 * e), dy: (u.y - l.y) / (2 * e) };
}
// t samples per quadrant, denser toward tips (t=0 right tip, pi/2 bottom...) using ease
const per = 9; const ts = [];
for (let q = 0; q < 4; q++) for (let i = 0; i < per; i++) {
  const u = i / per, e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2; // ease in/out
  ts.push((q + 0.35 * u + 0.65 * e) * Math.PI / 2);
}
ts.push(2 * Math.PI);
const X = (p) => P.cx + p.x, Y = (p) => P.cy + p.y;
let d = "";
for (let i = 0; i < ts.length; i++) {
  const p = pt(ts[i]);
  if (i === 0) { d += `M${f(X(p))} ${f(Y(p))}`; continue; }
  const q = pt(ts[i - 1]), h = (ts[i] - ts[i - 1]) / 3;
  d += `C${f(X(q) + q.dx * h)} ${f(Y(q) + q.dy * h)} ${f(X(p) - p.dx * h)} ${f(Y(p) - p.dy * h)} ${f(X(p))} ${f(Y(p))}`;
}
d += "Z";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c10-base" gradientUnits="userSpaceOnUse" x1="190" y1="500" x2="834" y2="540">
<stop offset="0" stop-color="#7FE5C4"/><stop offset="0.27" stop-color="#8FEBCF"/><stop offset="0.5" stop-color="#FFFFFF"/><stop offset="0.72" stop-color="#C4B4FF"/><stop offset="0.9" stop-color="#B9A6FF"/><stop offset="1" stop-color="#9BB0FF"/>
</linearGradient>
<linearGradient id="c10-sky" gradientUnits="userSpaceOnUse" x1="512" y1="470" x2="512" y2="860">
<stop offset="0" stop-color="#4A9EFF" stop-opacity="0"/><stop offset="0.55" stop-color="#6FB4FF" stop-opacity="0.35"/><stop offset="1" stop-color="#4A9EFF" stop-opacity="0.9"/>
</linearGradient>
<radialGradient id="c10-hi" gradientUnits="userSpaceOnUse" cx="500" cy="440" r="190" gradientTransform="translate(500 440) scale(0.6 1) translate(-500 -440)">
<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.8"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>
<clipPath id="c10-clip"><path d="${d}"/></clipPath>
</defs>
<rect width="1024" height="1024" rx="232" fill="#0B0C0E"/>
<g clip-path="url(#c10-clip)">
<rect x="180" y="150" width="660" height="740" fill="url(#c10-base)"/>
<rect x="180" y="150" width="660" height="740" fill="url(#c10-sky)"/>
<rect x="180" y="150" width="660" height="740" fill="url(#c10-hi)"/>
</g>
</svg>`;
writeFileSync(new URL("../svg/10-sparkle-wave.svg", import.meta.url), svg);
