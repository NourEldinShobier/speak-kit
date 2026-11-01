import fs from 'node:fs';
const T = Math.tan(11 * Math.PI / 180);
const P = {
  px: [-224, -112, 0, 112, 224], H: [98, 160, 214, 258, 148],
  vx: [-168, -56, 56, 168], vy: [4, -2, -8, 0],       // top valleys (y up = negative)
  lob: [74, 90, 94, 72], notch: [16, 22, 24, 22],            // bottom lobes / notches (y down = positive)
  tipR: 34, vh: 15, lh: 24, nh: 20, L: [-306, 0], R: [308, 0], dx: 38,
};
const pts = []; // sequence of bezier segs [p0,c1,c2,p1] upright coords
const seg = (a, b, c, d) => pts.push([a, b, c, d]);
const A = (x, y) => [x, y];
// top edge L -> R
const tops = [];
tops.push({ p: P.L, kind: 'L' });
for (let i = 0; i < 5; i++) {
  tops.push({ p: A(P.px[i], -P.H[i]), kind: 'peak' });
  if (i < 4) tops.push({ p: A(P.vx[i], P.vy[i]), kind: 'valley' });
}
tops.push({ p: P.R, kind: 'R' });
for (let i = 0; i < tops.length - 1; i++) {
  const a = tops[i], b = tops[i + 1];
  let c1, c2;
  if (a.kind === 'L') c1 = A(a.p[0] + 46, a.p[1] - 4);
  else if (a.kind === 'peak') c1 = A(a.p[0] + P.tipR + 2, a.p[1]);
  else c1 = A(a.p[0] + P.vh, a.p[1]);
  if (b.kind === 'R') c2 = A(b.p[0] - 46, b.p[1] - 4);
  else if (b.kind === 'peak') c2 = A(b.p[0] - P.tipR - 2, b.p[1]);
  else c2 = A(b.p[0] - P.vh, b.p[1]);
  // peak->valley and valley->peak: stretch handles vertically to make flame concavity
  seg(a.p, c1, c2, b.p);
}
// right tip rounding then bottom edge R -> L
const bots = [{ p: P.R, kind: 'R' }];
for (let i = 3; i >= 0; i--) {
  bots.push({ p: A(P.vx[i], P.lob[i]), kind: 'lobe' });
  if (i > 0) bots.push({ p: A(P.px[i], P.notch[i]), kind: 'notch' });
}
bots.push({ p: P.L, kind: 'L' });
for (let i = 0; i < bots.length - 1; i++) {
  const a = bots[i], b = bots[i + 1];
  const h = k => (k === 'lobe' ? P.lh : P.nh);
  let c1, c2;
  if (a.kind === 'R') c1 = A(a.p[0] - 40, a.p[1] + 2);
  else c1 = A(a.p[0] - h(a.kind), a.p[1]);
  if (b.kind === 'L') c2 = A(b.p[0] + 40, b.p[1] + 2);
  else c2 = A(b.p[0] + h(b.kind), b.p[1]);
  seg(a.p, c1, c2, b.p);
}
// transform: shear (lean forward), centre
const sh = ([x, y]) => [x - y * T, y];
let all = pts.flat().map(sh);
const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
const OX = 512 - cx, OY = 512 - cy + (+process.env.DY || 0);
const f = n => (+n.toFixed(2)).toString();
const tr = p => { const q = sh(p); return `${f(q[0] + OX)} ${f(q[1] + OY)}`; };
let d = `M${tr(pts[0][0])}`;
for (const s of pts) d += `C${tr(s[1])} ${tr(s[2])} ${tr(s[3])}`;
d += 'Z';
const dot = sh([P.px[3] + P.dx + 22, -P.H[3] - 8]);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<rect id="c05-tile" width="1024" height="1024" rx="232" fill="#0B0C0E"/>
<path id="c05-pulse" fill="#FFFFFF" d="${d}"/>
<circle id="c05-word" cx="${f(dot[0] + OX)}" cy="${f(dot[1] + OY)}" r="19" fill="#F2C04E"/>
</svg>
`;
fs.writeFileSync(new URL('../svg/05-liquid-pulse.svg', import.meta.url), svg);
console.log('bbox w', Math.max(...xs) - Math.min(...xs), 'h', Math.max(...ys) - Math.min(...ys));
