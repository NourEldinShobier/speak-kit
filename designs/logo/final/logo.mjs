// The final SpeakKit logo: "Voice hub". A squircle kit of four pieces cut apart by two voice waves,
// held together by a round blue voice disc with a white wave. Writes the master set into ./svg/logo/.
import { writeFileSync, mkdirSync } from "node:fs";
import * as K from "../v2/kit.mjs";
import { squircleD } from "../v2/squircle.mjs";

const OUT = new URL("./svg/logo/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const TAU = Math.PI * 2;
export const COLORS = { sky: "#2EC5FF", yellow: "#FFC23D", violet: "#7B61FF", deep: "#1F3FD1", hub: "#2F6BFF", wave: "#FFFFFF", ink: "#14161B", white: "#FFFFFF" };

// The container: a continuous-corner squircle filling the 1024 canvas (corner radius 22.4 % of the body, Apple icon grid, smoothing 0.6).
// The four pieces are cut a little larger than the squircle and clipped to it, so the seams reach the edge cleanly.
export const CORNER = 0.224;
export const squircle = (x = 0, y = 0, size = 1024, corner = CORNER) => squircleD(x, y, size, size * corner);
const K_GRID = 1.06, BOX = 530; // trace the pieces over 1.06x the canvas; the box they are cut from is 530 px from the centre
const tile = (x, y) => Math.max(Math.abs(x - 512), Math.abs(y - 512)) - BOX;
// scale an absolute M/C/L/Z path about the canvas centre
const scalePath = (d, k) => d.replace(/(-?[0-9.]+) (-?[0-9.]+)/g, (_, a, b) => `${f1(512 + (a - 512) * k)} ${f1(512 + (b - 512) * k)}`);
const f1 = (v) => (Math.round(v * 10) / 10).toString();

// p: geometry for one size class. full = 64 px and up, small = 16-48 px (wider seams, bigger hub, bolder wave)
// one line weight everywhere: the seams and the ring round the hub are exactly as thick as the wave
const even = (p) => ({ ...p, gap: (p.r * p.waveS) / 2, ring: p.r * p.waveS });
export const SIZES = {
  full: even({ amp: 42, period: 400, round: 18, r: 214, waveW: 1.2, waveA: 0.23, waveS: 0.19 }),
  small: even({ amp: 30, period: 400, round: 24, r: 240, waveW: 1.12, waveA: 0.25, waveS: 0.27 }),
};

export function geometry(p) {
  const sx = (y) => 512 + p.amp * Math.sin((TAU * (y - 112)) / p.period), sy = (x) => 512 - p.amp * Math.sin((TAU * (x - 112)) / p.period);
  const hole = (x, y) => -(Math.hypot(x - 512, y - 512) - (p.r + p.ring));
  const quad = (a, b) => (x, y) => Math.max(tile(x, y), K.smax(K.smax(a * (x - sx(y)) + p.gap, b * (y - sy(x)) + p.gap, p.round), hole(x, y), 16));
  // evaluate on a 1.06x wider region (the trace grid is the canvas), then scale the paths back up
  const wide = (f) => (x, y) => f(512 + (x - 512) * K_GRID, 512 + (y - 512) * K_GRID);
  const pieces = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => scalePath(K.shapePath(wide(quad(a, b))), K_GRID)); // TL, TR, BL, BR
  const w = p.r * p.waveW, A = p.r * p.waveA, sw = p.r * p.waveS;
  const wavePts = Array.from({ length: 121 }, (_, i) => { const u = i / 120; return [512 - w / 2 + w * u, 512 - A * Math.sin(TAU * 2 * u)]; });
  const waveStroke = `M${wavePts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L")}`;
  // the hub with the wave cut out, for one-colour versions
  const waveField = K.tube(wavePts.map(([x, y]) => [x, y, sw / 2]));
  const hubKnock = K.shapePath(K.cut(0, K.circle(512, 512, p.r), waveField));
  const hub = `M${512 - p.r} 512a${p.r} ${p.r} 0 1 0 ${2 * p.r} 0a${p.r} ${p.r} 0 1 0 ${-2 * p.r} 0Z`;
  return { clip: squircle(), pieces, hub, hubKnock, waveStroke, sw };
}

const shadow = `<filter id="hub-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#06070A" flood-opacity="0.28"/></filter>`;
const clipDef = (g) => `<clipPath id="sq"><path d="${g.clip}"/></clipPath>`;
const clipped = (paths) => `<g clip-path="url(#sq)">\n${paths.join("\n")}\n</g>`;
export function colour(g, { withShadow = true } = {}) {
  const fills = [COLORS.sky, COLORS.yellow, COLORS.violet, COLORS.deep];
  return K.svg(clipDef(g) + (withShadow ? shadow : ""), [
    clipped(g.pieces.map((d, i) => `<path d="${d}" fill="${fills[i]}"/>`)),
    `<path d="${g.hub}" fill="${COLORS.hub}"${withShadow ? ` filter="url(#hub-sh)"` : ""}/>`,
    `<path d="${g.waveStroke}" fill="none" stroke="${COLORS.wave}" stroke-width="${f1(g.sw)}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join("\n"));
}
export const mono = (g, c) =>
  K.svg(clipDef(g), clipped(g.pieces.map((d) => `<path d="${d}" fill="${c}"/>`)) + `\n<path d="${g.hubKnock}" fill="${c}" fill-rule="evenodd"/>`);

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
if (process.argv[1]?.split(/[\\/]/).slice(-2).join("/") === "final/logo.mjs") console.log("written", build().join(", "));
