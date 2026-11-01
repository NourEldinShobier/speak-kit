import { writeFileSync } from "node:fs";
const f = (n) => +n.toFixed(2);
const bez = (p, t) => { const u = 1 - t; return [0,1].map(i => u*u*u*p[0][i] + 3*u*u*t*p[1][i] + 3*u*t*t*p[2][i] + t*t*t*p[3][i]); };
const dbez = (p, t) => { const u = 1 - t; return [0,1].map(i => 3*u*u*(p[1][i]-p[0][i]) + 6*u*t*(p[2][i]-p[1][i]) + 3*t*t*(p[3][i]-p[2][i])); };
// closed Catmull-Rom -> cubic path
function smooth(pts) {
  const n = pts.length; let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n], p3 = pts[(i+2)%n];
    const c1 = [p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6], c2 = [p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}
// tapered stroke with round caps along a cubic; w(t) = full width
function stroke(p, w, N = 64) {
  const L = [], R = [];
  const nrm = (t) => { const [x, y] = dbez(p, t); const l = Math.hypot(x, y); return [-y/l, x/l, x/l, y/l]; };
  for (let i = 0; i <= N; i++) { const t = i/N, c = bez(p, t), n = nrm(t), h = w(t)/2; L.push([c[0]+n[0]*h, c[1]+n[1]*h]); R.push([c[0]-n[0]*h, c[1]-n[1]*h]); }
  const cap = (t, sgn) => { const c = bez(p, t), n = nrm(t), h = w(t)/2, out = [];
    for (let k = 1; k < 12; k++) { const a = Math.PI*k/12; // from +normal sweeping around tangent
      const dir = sgn > 0 ? 1 : -1;
      out.push([c[0] + h*(Math.cos(a)*n[0]*dir + Math.sin(a)*n[2]*sgn), c[1] + h*(Math.cos(a)*n[1]*dir + Math.sin(a)*n[3]*sgn)]); }
    return out; };
  const endCap = cap(1, 1); // L end -> R end going forward
  const startCap = cap(0, -1); // R start -> L start going backward
  return smooth([...L, ...endCap, ...R.reverse(), ...startCap]);
}
const sw = (a, b, c) => (t) => a + (c - a) * t + 0 * b; // placeholder
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => t*t*(3-2*t);
// stem: swelling pulse, width 80 ends -> 100 mid
const stem = stroke([[422,335],[422,440],[422,540],[422,650]], (t) => 82 + 12*Math.sin(Math.PI*t));
// arm: junction -> top right, bowed, tapering
const arm = stroke([[428,515],[490,470],[540,410],[598,342]], (t) => lerp(88, 66, sm(t)));
// leg: junction -> bottom right
const leg = stroke([[428,515],[500,545],[545,600],[606,662]], (t) => lerp(86, 68, sm(t)));
// superellipse window
const n = 3.9, a = 318, cx = 512, cy = 512; const wp = [];
for (let i = 0; i < 72; i++) { const th = 2*Math.PI*i/72, c = Math.cos(th), s = Math.sin(th);
  wp.push([cx + a*Math.sign(c)*Math.abs(c)**(2/n), cy + a*Math.sign(s)*Math.abs(s)**(2/n)]); }
const win = smooth(wp);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c16-glow" gradientUnits="userSpaceOnUse" x1="0" y1="830" x2="0" y2="610"><stop offset="0" stop-color="#1E6BFF"/><stop offset="0.35" stop-color="#1E6BFF" stop-opacity="0.55"/><stop offset="0.7" stop-color="#1E6BFF" stop-opacity="0.15"/><stop offset="1" stop-color="#1E6BFF" stop-opacity="0"/></linearGradient>
<radialGradient id="c16-bloom" gradientUnits="userSpaceOnUse" cx="512" cy="840" r="260" gradientTransform="translate(512 840) scale(1 0.55) translate(-512 -840)"><stop offset="0" stop-color="#3D8BFF" stop-opacity="0.8"/><stop offset="1" stop-color="#1E6BFF" stop-opacity="0"/></radialGradient>
<linearGradient id="c16-k" gradientUnits="userSpaceOnUse" x1="0" y1="330" x2="0" y2="670"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E6F0FF"/></linearGradient>
<clipPath id="c16-clip"><path d="${win}"/></clipPath>
</defs>
<rect width="1024" height="1024" rx="232" fill="#FFFFFF"/>
<rect x="0.5" y="0.5" width="1023" height="1023" rx="231.5" fill="none" stroke="#E6E6E6" stroke-width="1"/>
<path d="${win}" fill="#0A0B0D"/>
<g clip-path="url(#c16-clip)"><rect x="180" y="600" width="664" height="250" fill="url(#c16-glow)"/><rect x="180" y="640" width="664" height="210" fill="url(#c16-bloom)"/></g>
<g fill="url(#c16-k)" transform="translate(512 500) scale(1.1) translate(-512 -500)"><path d="${stem}"/><path d="${arm}"/><path d="${leg}"/></g>
</svg>`;
writeFileSync(new URL("../svg/16-window-k.svg", import.meta.url), svg);
