// Final SpeakKit mark: the Puzzle kit. The tile itself is the kit, four pieces cut apart by two voice waves;
// one warm piece is the word being read. Writes every variant into ./svg/.
import { writeFileSync, mkdirSync } from "node:fs";
import * as K from "../v2/kit.mjs";

const OUT = new URL("./svg/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const TAU = Math.PI * 2;

// Palettes: top-left, top-right (the read word), bottom-left, bottom-right.
export const PALETTES = {
  brand: ["#2F6BFF", "#FFC23D", "#7B61FF", "#2EC5FF"], // cool family + one warm piece (primary)
  blues: ["#2F6BFF", "#FFC23D", "#1F3FD1", "#6FA0FF"], // one blue family + the warm piece
  classic: ["#2F6BFF", "#FFC23D", "#FF6B57", "#2FCF9F"], // round 3 colours (reads close to Microsoft's four colours)
};

// gap: half-width of each seam; amp/period: seam wave; round: corner softening where edges meet
export function pieces({ gap = 13, amp = 42, period = 400, round = 18, inset = 4 } = {}) {
  const R = 512 - inset, m = 5;
  const sx = (y) => 512 + amp * Math.sin((TAU * (y - 112)) / period);
  const sy = (x) => 512 - amp * Math.sin((TAU * (x - 112)) / period);
  const tile = (x, y) => { const u = Math.abs(x - 512) / R, v = Math.abs(y - 512) / R; return ((u ** m + v ** m) ** (1 / m) - 1) * R; };
  const q = (a, b) => (x, y) => K.smax(K.smax(tile(x, y), a * (x - sx(y)) + gap, round), b * (y - sy(x)) + gap, round);
  // order: top-left, top-right, bottom-left, bottom-right
  return [q(1, 1), q(-1, 1), q(1, -1), q(-1, -1)].map((f) => K.shapePath(f));
}

const svg = (paths, fills) => K.svg("", paths.map((d, i) => `<path d="${d}" fill="${fills[i]}"/>`).join("\n"));

export function build() {
  const full = pieces(), small = pieces({ gap: 26, amp: 34, round: 22 });
  const files = {
    "speakkit-mark": svg(full, PALETTES.brand),
    "speakkit-mark-blues": svg(full, PALETTES.blues),
    "speakkit-mark-classic": svg(full, PALETTES.classic),
    "speakkit-mark-mono-ink": svg(full, Array(4).fill("#14161B")),
    "speakkit-mark-mono-white": svg(full, Array(4).fill("#FFFFFF")),
    // 16-32 px: wider seams and calmer waves so the four pieces survive the downscale
    "speakkit-mark-small": svg(small, PALETTES.brand),
    "speakkit-mark-small-mono-white": svg(small, Array(4).fill("#FFFFFF")),
  };
  for (const [name, s] of Object.entries(files)) writeFileSync(new URL(`${name}.svg`, OUT), s);
  return Object.keys(files);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) console.log("written", build().join(", "));
