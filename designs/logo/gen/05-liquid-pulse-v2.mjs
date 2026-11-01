import fs from 'node:fs';
const OUT = 'D:/workspaces/speak-it/designs/logo/svg/';
const K = Math.tan(10 * Math.PI / 180);       // forward lean
const P = 108, B = 0;                        // peak pitch, baseline y (up is negative)
const H = [0.52, 0.78, 0.95, 1.0, 0.64].map(h => h * 300);
const px = i => 100 + i * P;                  // peak x
const vx = i => px(i) + P / 2;                // valley x between peak i and i+1
const vy = [-34, -50, -54, -44];
const lobeDepth = [56, 74, 78, 62];
const T = [1, 0], Lf = [-1, 0];
// anchor: x,y, d = unit tangent in travel direction, a/b = in/out handle lengths
const A = (x, y, d, a, b) => ({ x, y, d, a, b });
const top = [A(0, B, [Math.cos(0.22), -Math.sin(0.22)], 0, 44)];
for (let i = 0; i < 5; i++) {
  top.push(A(px(i), -H[i], T, 32, 32));       // rounded teardrop tip
  if (i < 4) top.push(A(vx(i), vy[i], T, 15, 15)); // pinched neck
}
top.push(A(px(4) + 80, B, [Math.cos(0.18), Math.sin(0.18)], 46, 0));
// bottom, travelling right to left
const bot = [];
for (let i = 3; i >= 0; i--) {
  bot.push(A(vx(i), lobeDepth[i], Lf, 26, 26)); // round drip
  if (i > 0) bot.push(A(px(i), 14 + i * 2, Lf, 12, 12)); // shallow notch under peak
}
const seg = (p, q) => {
  const c1 = [p.x + p.d[0] * p.b, p.y + p.d[1] * p.b], c2 = [q.x - q.d[0] * q.a, q.y - q.d[1] * q.a];
  return [c1, c2, [q.x, q.y]];
};
// connect right tail tip -> first lobe, last lobe -> left tip with own tangents
const tailTip = top[top.length - 1], leftTip = top[0];
const tailOut = A(tailTip.x, tailTip.y, [-Math.cos(0.2), Math.sin(0.2)], 0, 50);
const tipIn = A(leftTip.x, leftTip.y, [-Math.cos(0.2), -Math.sin(0.2)], 46, 0);
const chain = [...top, ...[tailOut], ...bot, tipIn];
// drop duplicate start: top[last] followed by tailOut (same point, corner) -> handle explicitly
const pts = []; const segs = [];
for (let i = 0; i < chain.length - 1; i++) {
  const p = chain[i], q = chain[i + 1];
  if (p === tailTip && q === tailOut) continue;
  segs.push([p, ...seg(p, q)]);
}
// transform: shear about baseline, then scale/centre
const sh = ([x, y]) => [x + K * (B - y), y];
const raw = segs.map(([p, c1, c2, e]) => ({ s: sh([p.x, p.y]), c1: sh(c1), c2: sh(c2), e: sh(e) }));
const bez = (t, a, b, c, d) => a * (1-t)**3 + 3*b*t*(1-t)**2 + 3*c*t*t*(1-t) + d*t**3;
let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
for (const r of raw) for (let k = 0; k <= 60; k++) {
  const t = k / 60, x = bez(t, r.s[0], r.c1[0], r.c2[0], r.e[0]), y = bez(t, r.s[1], r.c1[1], r.c2[1], r.e[1]);
  x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
}
const f = n => (+n.toFixed(2)).toString();
function build(width, cy) {
  const s = width / (x1 - x0), tx = 512 - s * (x0 + x1) / 2, ty = cy - s * (y0 + y1) / 2;
  const T2 = ([x, y]) => [s * x + tx, s * y + ty].map(f).join(' ');
  let d = 'M' + T2(raw[0].s);
  for (const r of raw) d += 'C' + T2(r.c1) + ' ' + T2(r.c2) + ' ' + T2(r.e);
  d += 'Z';
  const tip = sh([px(3), -H[3]]);
  const [tx3, ty3] = T2(tip).split(' ').map(Number);
  const r = 0.0185 * width / 0.64 * 0.64 * 1.0; // dot radius scales with mark
  return { d, dot: [tx3 + 0.105 * width, ty3 - 0.02 * width, 0.028 * width] };
}
function write(name, width, cy, tile) {
  const { d, dot } = build(width, cy);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n` +
    (tile ? `<rect id="c05-tile" width="1024" height="1024" rx="232" fill="#0B0C0E"/>\n` : '') +
    `<path id="c05-pulse" fill="#FFFFFF" d="${d}"/>\n<circle id="c05-word" cx="${f(dot[0])}" cy="${f(dot[1])}" r="${f(dot[2])}" fill="#F2C04E"/>\n</svg>\n`;
  fs.writeFileSync(OUT + name, svg);
}
write('05-liquid-pulse-v2.svg', 655, 535, true);
write('05-liquid-pulse-v2-free.svg', 720, 520, false);
