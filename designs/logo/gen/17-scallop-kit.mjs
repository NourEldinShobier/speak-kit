// Generates 17-scallop-kit.svg: four wavy shapes (polar curves -> Hermite cubics, G1 exact) + sine voice stroke.
import { writeFileSync } from "node:fs";
const f = (n) => +n.toFixed(2);
// closed polar shape: r(t) with t=0 at top, clockwise. Hermite cubic per step.
function polar(cx, cy, r, steps) {
  const P = (t) => { const rr = r(t); return [cx + rr * Math.sin(t), cy - rr * Math.cos(t)]; };
  const D = (t) => { const h = 1e-5, a = P(t - h), b = P(t + h); return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h)]; };
  const dt = (2 * Math.PI) / steps; let d = "";
  for (let i = 0; i < steps; i++) {
    const t0 = i * dt, t1 = t0 + dt, p0 = P(t0), p1 = P(t1), d0 = D(t0), d1 = D(t1);
    if (i === 0) d += `M${f(p0[0])} ${f(p0[1])}`;
    d += `C${f(p0[0] + d0[0] * dt / 3)} ${f(p0[1] + d0[1] * dt / 3)} ${f(p1[0] - d1[0] * dt / 3)} ${f(p1[1] - d1[1] * dt / 3)} ${f(p1[0])} ${f(p1[1])}`;
  }
  return d + "Z";
}
// soft-max union of n circular lobes (centre distance d, radius rho), p-norm blend keeps notches G1
function lobes(n, d, rho, p) { return (t) => { let sum = 0;
  for (let i = 0; i < n; i++) { let dl = t - (2 * Math.PI * i) / n; dl = Math.atan2(Math.sin(dl), Math.cos(dl));
    const q = rho * rho - d * d * Math.sin(dl) ** 2; const r = Math.abs(dl) < Math.PI / 2 && q > 0 ? d * Math.cos(dl) + Math.sqrt(q) : 0; sum += r ** p; }
  return sum ** (1 / p); }; }
const C = 307, E = 717, R = 150;
const star = (t) => R * 0.98 * (1 + 0.13 * (Math.cos(8 * t) - 0.04 * Math.cos(16 * t)));
const disc = (t) => R * 0.96 * (1 + 0.04 * (Math.cos(10 * t) - 0.12 * Math.cos(20 * t)));
const flower = lobes(10, 112, 40, 24);
const clover = lobes(5, 84, 66, 40);
// vertical optical nudge: clover/star centroids fine at polar centre
// sine wave: 2 full periods, Hermite per quarter period
function wave(cx, cy, w, amp, periods) {
  const k = (2 * Math.PI * periods) / w, x0 = cx - w / 2, n = periods * 4, dx = w / n;
  const P = (x) => [x, cy - amp * Math.sin(k * (x - x0))], S = (x) => -amp * k * Math.cos(k * (x - x0));
  let d = `M${f(x0)} ${f(P(x0)[1])}`;
  for (let i = 0; i < n; i++) { const a = x0 + i * dx, b = a + dx;
    d += `C${f(a + dx / 3)} ${f(P(a)[1] + S(a) * dx / 3)} ${f(b - dx / 3)} ${f(P(b)[1] - S(b) * dx / 3)} ${f(b)} ${f(P(b)[1])}`; }
  return d;
}
const sh = (id) => `filter="url(#c17-sh)"`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><filter id="c17-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0B0C0E" flood-opacity="0.12"/></filter>
<filter id="c17-tile" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#0B0C0E" flood-opacity="0.08"/></filter></defs>
<rect x="2" y="2" width="1020" height="1020" rx="232" fill="#FFFFFF" stroke="#E9E9E9" stroke-width="2"/>
<path d="${polar(C, C, star, 48)}" fill="#F2C04E" ${sh()}/>
<path d="${polar(E, C, disc, 40)}" fill="#2D6BFF" ${sh()}/>
<path d="${polar(C, E, flower, 40)}" fill="#9C7BFF" ${sh()}/>
<path d="${polar(E, E, clover, 40)}" fill="#2FCF9F" ${sh()}/>
<path d="${wave(E, C, 170, 30, 2)}" fill="none" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(new URL("../svg/17-scallop-kit.svg", import.meta.url), svg);
