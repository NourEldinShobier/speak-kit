// Generates designs/logo/svg/08-sparkle-voice.svg
import { writeFileSync } from "node:fs";
const f = (n) => +n.toFixed(2);
const P = (x, y) => `${f(x)} ${f(y)}`;
// sparkle params
const V = 226, H = 162, r = 4.5, r2 = 4;
const cx = 366, cy = 512;
const y0 = -V + r, xe = H - r2;
const F = [[r, y0], [r + 4, y0 + 0.64 * V], [xe - 0.66 * H, -r2 - 4], [xe, -r2]];
const T = (pts, sx, sy, rev) => (rev ? [...pts].reverse() : pts).map(([x, y]) => [cx + sx * x, cy + sy * y]);
const seg = (pts) => `C${P(...pts[1])} ${P(...pts[2])} ${P(...pts[3])}`;
const S = (x, y) => [cx + x, cy + y];
const k = 1.333;
let d = `M${P(...S(-r, y0))}`;
d += `C${P(...S(-r, y0 - k * r))} ${P(...S(r, y0 - k * r))} ${P(...S(r, y0))}`;
d += seg(T(F, 1, 1, false));
d += `C${P(...S(xe + k * r2, -r2))} ${P(...S(xe + k * r2, r2))} ${P(...S(xe, r2))}`;
d += seg(T(F, 1, -1, true));
d += `C${P(...S(r, -y0 + k * r))} ${P(...S(-r, -y0 + k * r))} ${P(...S(-r, -y0))}`;
d += seg(T(F, -1, -1, false));
d += `C${P(...S(-xe - k * r2, r2))} ${P(...S(-xe - k * r2, -r2))} ${P(...S(-xe, -r2))}`;
d += seg(T(F, -1, 1, true));
d += "Z";
const spark = d;
// lens bars
const a = 36, tipX = cx + H;
const bars = [[tipX + 6, 486], [tipX + 6 + 106, 352], [tipX + 6 + 212, 224]];
const lens = ([x, h]) => {
  const b = h / 2, q = 0.5523, w = a * 0.9;
  return `M${P(x, cy - b)}C${P(x + q * w, cy - b)} ${P(x + w, cy - q * b)} ${P(x + w, cy)}C${P(x + w, cy + q * b)} ${P(x + q * w, cy + b)} ${P(x, cy + b)}C${P(x - q * w, cy + b)} ${P(x - w, cy + q * b)} ${P(x - w, cy)}C${P(x - w, cy - q * b)} ${P(x - q * w, cy - b)} ${P(x, cy - b)}Z`;
};
const x0 = cx - H, x1 = bars[2][0] + a;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="c08-grad" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="0" x2="${f(x1)}" y2="0">
      <stop offset="0" stop-color="#7FE5C4"/>
      <stop offset="0.3" stop-color="#C8F6EA"/>
      <stop offset="0.45" stop-color="#FFFFFF"/>
      <stop offset="0.68" stop-color="#B9A6FF"/>
      <stop offset="1" stop-color="#4A9EFF"/>
    </linearGradient>
    <radialGradient id="c08-sheen" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy - 95}" r="125">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/>
      <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="232" fill="#0B0C0E"/>
  <g fill="url(#c08-grad)">
${bars.map((b) => `    <path d="${lens(b)}"/>`).join("\n")}
  </g>
  <path d="${spark}" fill="#0B0C0E" stroke="#0B0C0E" stroke-width="9" stroke-linejoin="round"/>
  <path d="${spark}" fill="url(#c08-grad)"/>
  <path d="${spark}" fill="url(#c08-sheen)"/>
</svg>
`;
writeFileSync(new URL("../svg/08-sparkle-voice.svg", import.meta.url), svg);
