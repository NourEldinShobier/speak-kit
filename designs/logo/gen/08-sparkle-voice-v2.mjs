// Generates 08-sparkle-voice-v2.svg and -v2-blue.svg
import { writeFileSync } from "node:fs";
const f = (n) => +n.toFixed(2);
const Q = (p) => `${f(p[0])} ${f(p[1])}`;
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];

// ---- parameters
const P = {
  V: 252, HL: 224, r: 3.6, th: 0.045,   // vertical arm, horizontal arm, tip radius, tip taper angle
  aV: 0.68, aH: 0.7, bV: 0.7, bH: 0.7,   // handle ratios (fraction of arm length)
  D: 210, gap: 8, g: 36, W: 635,
  bars: [{ w: 34, ry: 256 }, { w: 28, ry: 186 }, { w: 22, ry: 120 }],
  CY: 512,
};
const { V, HL, r, th } = P;
// tips clockwise on screen: top, right, bottom, left (local origin = sparkle centre)
const tips = [[0, -1, V, "V"], [1, 0, HL, "H"], [0, 1, V, "V"], [-1, 0, HL, "H"]].map(([dx, dy, L, t]) => ({
  d: [dx, dy], p: [-dy, dx], L, t,
}));
const cs = Math.cos(th), sn = Math.sin(th), k = r * 1.35;
const segs = []; // cubic segments [p0,p1,p2,p3]
const info = tips.map((T) => {
  const B = add([0, 0], T.d, T.L - r);
  const Sin = add(B, T.p, -r), Sout = add(B, T.p, r);
  const tin = [T.d[0] * cs + T.p[0] * sn, T.d[1] * cs + T.p[1] * sn];
  const tout = [-T.d[0] * cs + T.p[0] * sn, -T.d[1] * cs + T.p[1] * sn];
  return { T, Sin, Sout, tin, tout };
});
info.forEach((A, i) => {
  const Bn = info[(i + 1) % 4];
  // cap
  segs.push([A.Sin, add(A.Sin, A.tin, k), add(A.Sout, [-A.tout[0] , -A.tout[1]].map((v, j) => v), k * 0 + 0) && add(A.Sout, [A.T.d[0] * cs - A.T.p[0] * sn, A.T.d[1] * cs - A.T.p[1] * sn], k), A.Sout]);
  // flank to next tip
  const aR = A.T.t === "V" ? P.aV : P.aH, bR = Bn.T.t === "V" ? P.bV : P.bH;
  const la = A.T.L * aR, lb = Bn.T.L * bR;
  segs.push([A.Sout, add(A.Sout, A.tout, la), add(Bn.Sin, Bn.tin, -lb), Bn.Sin]);
});
const bez = (s, t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u ** 3 * s[0][i] + 3 * u * u * t * s[1][i] + 3 * u * t * t * s[2][i] + t ** 3 * s[3][i]);
};
const poly = segs.flatMap((s) => Array.from({ length: 60 }, (_, i) => bez(s, i / 60)));
let A2 = 0, mx = 0;
poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; const c = p[0] * q[1] - q[0] * p[1]; A2 += c; mx += (p[0] + q[0]) * c; });
const sparkArea = Math.abs(A2 / 2), sparkCx = mx / (3 * A2); // centroid x relative to sparkle centre
const minX = Math.min(...poly.map((p) => p[0]));

// ---- layout (x in canvas coords)
const [b1, b2, b3] = P.bars;
const bc = [P.D];
bc.push(bc[0] + b1.w + P.g + b2.w);
bc.push(bc[1] + b2.w + P.g + b3.w);
const leftRel = minX, rightRel = bc[2] + b3.w;
const bboxW = rightRel - leftRel;
// mass centroid
const masses = [[sparkArea, sparkCx], ...P.bars.map((b, i) => [Math.PI * b.w * b.ry * 0.9, bc[i]])];
const mTot = masses.reduce((s, m) => s + m[0], 0);
const cenRel = masses.reduce((s, m) => s + m[0] * m[1], 0) / mTot;
const bboxC = (leftRel + rightRel) / 2;
const optC = 0.95 * bboxC + 0.05 * cenRel; // blend of bbox centre and mass centroid
const cx = 512 - optC, cy = P.CY;
const sx = (x) => cx + x;

const pathOf = (ss, tx, ty) => {
  let d = `M${Q([ss[0][0][0] + tx, ss[0][0][1] + ty])}`;
  ss.forEach((s) => (d += `C${Q([s[1][0] + tx, s[1][1] + ty])} ${Q([s[2][0] + tx, s[2][1] + ty])} ${Q([s[3][0] + tx, s[3][1] + ty])}`));
  return d + "Z";
};
const spark = pathOf(segs, cx, cy);
const ell = (x, y, rx, ry) => {
  const q = 0.5523;
  return `M${Q([x + rx, y])}C${Q([x + rx, y + q * ry])} ${Q([x + q * rx, y + ry])} ${Q([x, y + ry])}C${Q([x - q * rx, y + ry])} ${Q([x - rx, y + q * ry])} ${Q([x - rx, y])}C${Q([x - rx, y - q * ry])} ${Q([x - q * rx, y - ry])} ${Q([x, y - ry])}C${Q([x + q * rx, y - ry])} ${Q([x + rx, y - q * ry])} ${Q([x + rx, y])}Z`;
};
const barPaths = P.bars.map((b, i) => ell(sx(bc[i]), cy, b.w, b.ry));
const hole = ell(sx(bc[0]), cy, b1.w + P.gap, b1.ry + P.gap);
const clip = `<clipPath id="c08-cut"><path clip-rule="evenodd" d="M0 0H1024V1024H0Z${hole}"/></clipPath>`;

const x0 = sx(leftRel), x1 = sx(rightRel);
const wOff = (cx - x0) / (x1 - x0); // sparkle centre offset along gradient
const grad = `<linearGradient id="c08-grad" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="0" x2="${f(x1)}" y2="0">
      <stop offset="0" stop-color="#7FE5C4"/>
      <stop offset="${f(wOff * 0.5)}" stop-color="#B8F4E1"/>
      <stop offset="${f(wOff)}" stop-color="#F4FFFC"/>
      <stop offset="${f(wOff + (1 - wOff) * 0.5)}" stop-color="#B9A6FF"/>
      <stop offset="1" stop-color="#4A9EFF"/>
    </linearGradient>`;
const sheen = `<radialGradient id="c08-sheen" gradientUnits="userSpaceOnUse" cx="${f(cx - 85)}" cy="${f(cy - 70)}" r="130">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>`;
const head = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">`;
const body = (fill) => `  <g fill="${fill}">
${barPaths.map((d) => `    <path d="${d}"/>`).join("\n")}
  </g>
  <g clip-path="url(#c08-cut)">
    <path d="${spark}" fill="${fill}"/>
  </g>`;
const v2 = `${head}
  <defs>
    ${grad}
    ${sheen}
    ${clip}
  </defs>
  <rect width="1024" height="1024" rx="232" fill="#0B0C0E"/>
${body("url(#c08-grad)")}
  <g clip-path="url(#c08-cut)">
    <path d="${spark}" fill="url(#c08-sheen)"/>
  </g>
</svg>
`;
const blue = `${head}
  <defs>
    <linearGradient id="c08-tile" gradientUnits="userSpaceOnUse" x1="0" y1="1024" x2="1024" y2="0">
      <stop offset="0" stop-color="#0A2E9E"/>
      <stop offset="0.5" stop-color="#1F56E8"/>
      <stop offset="1" stop-color="#3F7BFF"/>
    </linearGradient>
    <linearGradient id="c08-fold" gradientUnits="userSpaceOnUse" x1="0" y1="160" x2="0" y2="520">
      <stop offset="0" stop-color="#051C70" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#051C70" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#051C70" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="c08-tileclip"><rect width="1024" height="1024" rx="232"/></clipPath>
    ${clip}
  </defs>
  <rect width="1024" height="1024" rx="232" fill="url(#c08-tile)"/>
  <g clip-path="url(#c08-tileclip)">
    <rect x="-300" y="160" width="1624" height="360" fill="url(#c08-fold)" transform="rotate(32 512 340)"/>
  </g>
${body("#FFFFFF")}
</svg>
`;
writeFileSync(new URL("../svg/08-sparkle-voice-v2.svg", import.meta.url), v2);
writeFileSync(new URL("../svg/08-sparkle-voice-v2-blue.svg", import.meta.url), blue);
console.log({ bboxW: f(bboxW), left: f(x0), right: f(x1), bboxCentre: f((x0 + x1) / 2), massCentroid: f(sx(cenRel)), cx: f(cx) });
