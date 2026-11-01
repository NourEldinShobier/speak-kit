// The final SpeakKit logo: "Voice hub". A squircle kit of four pieces cut apart by two voice waves,
// held together by a round blue voice disc with a white wave. Writes the master set into ./svg/logo/.
import { writeFileSync, mkdirSync } from "node:fs";
import * as K from "../v2/kit.mjs";

const OUT = new URL("./svg/logo/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const TAU = Math.PI * 2;
export const COLORS = { sky: "#2EC5FF", yellow: "#FFC23D", violet: "#7B61FF", deep: "#1F3FD1", hub: "#2F6BFF", wave: "#FFFFFF", ink: "#14161B", white: "#FFFFFF" };

const R = 508, M = 5;
const tile = (x, y) => { const u = Math.abs(x - 512) / R, v = Math.abs(y - 512) / R; return ((u ** M + v ** M) ** (1 / M) - 1) * R; };
const f1 = (v) => (Math.round(v * 10) / 10).toString();

// p: geometry for one size class. full = 64 px and up, small = 16-48 px (wider seams, bigger hub, bolder wave)
const SIZES = {
  full: { gap: 13, amp: 42, period: 400, round: 18, r: 168, ring: 26, waveW: 1.2, waveA: 0.23, waveS: 0.19 },
  small: { gap: 26, amp: 30, period: 400, round: 24, r: 206, ring: 40, waveW: 1.12, waveA: 0.25, waveS: 0.27 },
};

function geometry(p) {
  const sx = (y) => 512 + p.amp * Math.sin((TAU * (y - 112)) / p.period), sy = (x) => 512 - p.amp * Math.sin((TAU * (x - 112)) / p.period);
  const hole = (x, y) => -(Math.hypot(x - 512, y - 512) - (p.r + p.ring));
  const quad = (a, b) => (x, y) => K.smax(K.smax(K.smax(tile(x, y), a * (x - sx(y)) + p.gap, p.round), b * (y - sy(x)) + p.gap, p.round), hole(x, y), 16);
  const pieces = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => K.shapePath(quad(a, b))); // TL, TR, BL, BR
  const w = p.r * p.waveW, A = p.r * p.waveA, sw = p.r * p.waveS;
  const wavePts = Array.from({ length: 121 }, (_, i) => { const u = i / 120; return [512 - w / 2 + w * u, 512 - A * Math.sin(TAU * 2 * u)]; });
  const waveStroke = `M${wavePts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L")}`;
  // the hub with the wave cut out, for one-colour versions
  const waveField = K.tube(wavePts.map(([x, y]) => [x, y, sw / 2]));
  const hubKnock = K.shapePath(K.cut(0, K.circle(512, 512, p.r), waveField));
  const hub = `M${512 - p.r} 512a${p.r} ${p.r} 0 1 0 ${2 * p.r} 0a${p.r} ${p.r} 0 1 0 ${-2 * p.r} 0Z`;
  return { pieces, hub, hubKnock, waveStroke, sw };
}

const shadow = `<filter id="hub-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#06070A" flood-opacity="0.28"/></filter>`;
function colour(g, { withShadow = true } = {}) {
  const fills = [COLORS.sky, COLORS.yellow, COLORS.violet, COLORS.deep];
  return K.svg(withShadow ? shadow : "", [
    ...g.pieces.map((d, i) => `<path d="${d}" fill="${fills[i]}"/>`),
    `<path d="${g.hub}" fill="${COLORS.hub}"${withShadow ? ` filter="url(#hub-sh)"` : ""}/>`,
    `<path d="${g.waveStroke}" fill="none" stroke="${COLORS.wave}" stroke-width="${f1(g.sw)}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join("\n"));
}
const mono = (g, c) => K.svg("", [...g.pieces, g.hubKnock].map((d) => `<path d="${d}" fill="${c}" fill-rule="evenodd"/>`).join("\n"));

export function build() {
  const full = geometry(SIZES.full), small = geometry(SIZES.small);
  const files = {
    "speakkit-logo": colour(full),
    "speakkit-logo-flat": colour(full, { withShadow: false }),
    "speakkit-logo-mono-ink": mono(full, COLORS.ink),
    "speakkit-logo-mono-white": mono(full, COLORS.white),
    "speakkit-logo-small": colour(small, { withShadow: false }),
    "speakkit-logo-small-mono-ink": mono(small, COLORS.ink),
    "speakkit-logo-small-mono-white": mono(small, COLORS.white),
  };
  for (const [n, s] of Object.entries(files)) writeFileSync(new URL(`${n}.svg`, OUT), s);
  return Object.keys(files);
}
console.log("written", build().join(", "));
