// Isometric hex-prism row whose heights follow a wave envelope. Painter's order, no hidden lines.
import { writeFileSync } from 'node:fs';
const S = +process.env.S || 124, SW = +process.env.SW || 20, C = Math.sqrt(3) / 2;
const H = (process.env.H || '0.9,1.9,2.9,1.9,0.9').split(',').map(Number).map(h => h * S);
const A = [C * S, 0.5 * S], B = [-C * S, 0.5 * S];
const peak = H.indexOf(Math.max(...H)), Y = process.env.Y === 'all';
const org = k => [k * A[0], k * A[1]];
const add = (p, v, m = 1) => [p[0] + v[0] * m, p[1] + v[1] * m];
const up = (p, h) => [p[0], p[1] - h];
const geo = H.map((h, k) => {
  const P = org(k), Pb = add(P, B), Pa = add(P, A), Pab = add(Pb, A);
  return { h, hex: [up(P, h), up(Pb, h), Pb, Pab, Pa, up(Pa, h)], top: [up(P, h), up(Pb, h), up(Pab, h), up(Pa, h)], fr: [up(Pab, h), Pab] };
});
const all = geo.flatMap(g => g.hex);
const bx = [Math.min(...all.map(p => p[0])), Math.max(...all.map(p => p[0]))];
const by = [Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[1]))];
const dx = 512 - (bx[0] + bx[1]) / 2, dy = 512 - (by[0] + by[1]) / 2 + (+process.env.DY || 0);
const f = n => +n.toFixed(2);
const pts = ps => ps.map((p, i) => (i ? 'L' : 'M') + f(p[0] + dx) + ' ' + f(p[1] + dy)).join('');
const st = `stroke="#fff" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`;
let body = '';
geo.forEach((g, k) => {
  body += `<path d="${pts(g.hex)}Z" fill="#0B0C0E" ${st}/>`;
  if (k === peak) body += `<path d="${pts(g.top)}Z" fill="#F2C04E" ${st}/>`;
  if (k === peak || Y) body += `<path d="${pts(g.fr)}" fill="none" ${st}/>`;
  if (Y && k !== peak) body += `<path d="${pts(g.top)}Z" fill="none" ${st}/>`;
});
writeFileSync('designs/logo/svg/13-iso-wave-modules.svg',
`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="232" fill="#0B0C0E"/>${body}</svg>`);
console.log('bbox', f(bx[1] - bx[0] + SW), f(by[1] - by[0] + SW));
