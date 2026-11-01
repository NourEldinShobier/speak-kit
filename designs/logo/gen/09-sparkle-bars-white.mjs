import fs from 'node:fs';
const S = 1.78, f = n => +n.toFixed(2);
// reference px relative to sparkle centre (487,538); mark centre x=539 -> 512, y=538 -> 512
const X = x => f(512 + (x - 52) * S), Y = y => f(512 + y * S);
const P = (x, y) => `${X(x)} ${Y(y)}`;
const k = 0.5523;
// sparkle: tips top/bottom (ty=-98..), left/right arms
const T = 98, L = 77, R = 77, w = 8, h = 12; // tip half width / cap height
const a = 48, b = 36;
function arm(dir) { /* unused */ }
const d = [];
d.push(`M${P(-w, -T + h)}`);
d.push(`C${P(-w, -T + h - k * h)} ${P(-k * w, -T)} ${P(0, -T)}`);
d.push(`C${P(k * w, -T)} ${P(w, -T + h - k * h)} ${P(w, -T + h)}`);
// top-right flank to right arm top
d.push(`C${P(w, -T + h + a)} ${P(R - b, -w)} ${P(R - h, -w)}`);
d.push(`L${P(R - h, -w)}`);
d.push(`C${P(R - h + k * h, -w)} ${P(R, -k * w)} ${P(R, 0)}`);
d.push(`C${P(R, k * w)} ${P(R - h + k * h, w)} ${P(R - h, w)}`);
d.push(`C${P(R - b, w)} ${P(w, T - h - a)} ${P(w, T - h)}`);
d.push(`C${P(w, T - h + k * h)} ${P(k * w, T)} ${P(0, T)}`);
d.push(`C${P(-k * w, T)} ${P(-w, T - h + k * h)} ${P(-w, T - h)}`);
d.push(`C${P(-w, T - h - a)} ${P(-L + b, w)} ${P(-L + h, w)}`);
d.push(`C${P(-L + h - k * h, w)} ${P(-L, k * w)} ${P(-L, 0)}`);
d.push(`C${P(-L, -k * w)} ${P(-L + h - k * h, -w)} ${P(-L + h, -w)}`);
d.push(`C${P(-L + b, -w)} ${P(-w, -T + h + a)} ${P(-w, -T + h)}`);
d.push('Z');
// lens bars: [cx, halfW, halfH]
const lens = (cx, hw, hh) => `M${P(cx, -hh)}C${P(cx + hw * .56, -hh * .93)} ${P(cx + hw, -hh * .55)} ${P(cx + hw, 0)}C${P(cx + hw, hh * .55)} ${P(cx + hw * .56, hh * .93)} ${P(cx, hh)}C${P(cx - hw * .56, hh * .93)} ${P(cx - hw, hh * .55)} ${P(cx - hw, 0)}C${P(cx - hw, -hh * .55)} ${P(cx - hw * .56, -hh * .93)} ${P(cx, -hh)}Z`;
const bar1cx = 53, bw = 20;
// notch: pointed wedge from left edge of bar1 narrowing to a point inside the bar
const notch = `M${P(bar1cx - bw - 1, -12)}C${P(bar1cx - 5, -9)} ${P(bar1cx + 12, -3)} ${P(bar1cx + bw + 1, 0)}C${P(bar1cx + 12, 3)} ${P(bar1cx - 5, 9)} ${P(bar1cx - bw - 1, 12)}Z`;
const bar1 = lens(bar1cx, bw, 129) + notch;
const bar2 = lens(111 - 0 + 0, 16, 98).replace(/x/g, '');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c09-bg" gradientUnits="userSpaceOnUse" x1="120" y1="1024" x2="904" y2="0"><stop offset="0" stop-color="#0A2E9E"/><stop offset=".5" stop-color="#1F56E8"/><stop offset="1" stop-color="#3F7BFF"/></linearGradient>
<linearGradient id="c09-fold" gradientUnits="userSpaceOnUse" x1="150" y1="260" x2="620" y2="560"><stop offset="0" stop-color="#06217A" stop-opacity="0"/><stop offset=".45" stop-color="#06217A" stop-opacity=".5"/><stop offset=".62" stop-color="#0A2E9E" stop-opacity=".28"/><stop offset="1" stop-color="#0A2E9E" stop-opacity="0"/></linearGradient>
<clipPath id="c09-sp"><rect x="0" y="0" width="${X(bar1cx - bw - 3)}" height="1024"/></clipPath>
<filter id="c09-blur" filterUnits="userSpaceOnUse" x="-400" y="-400" width="1900" height="1900"><feGaussianBlur stdDeviation="38"/></filter>
<clipPath id="c09-clip"><rect width="1024" height="1024" rx="232"/></clipPath>
</defs>
<g clip-path="url(#c09-clip)">
<rect width="1024" height="1024" fill="url(#c09-bg)"/>
<path d="M-40 130C180 90 400 250 560 470C700 660 860 840 1080 900L1080 1100L-40 1100Z" fill="url(#c09-fold)" opacity=".0"/>
<path d="M-60 80C200 30 470 190 620 420C760 640 900 790 1100 830L1100 960C860 990 700 840 560 650C400 430 180 300 -60 330Z" fill="url(#c09-fold)" filter="url(#c09-blur)"/>
</g>
<g fill="#fff" fill-rule="evenodd">
<path clip-path="url(#c09-sp)" d="${d.join("")}"/>
<path d="${bar1}"/>
<path d="${lens(111, 16, 98)}"/>
<path d="${lens(168, 13.5, 66)}"/>
</g>
</svg>
`;
fs.writeFileSync('D:/workspaces/speak-it/designs/logo/svg/09-sparkle-bars-white.svg', svg);
