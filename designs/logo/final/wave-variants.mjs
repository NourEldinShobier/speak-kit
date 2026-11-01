// Four Puzzle kit variations that carry the blue voice-wave icon from round 3 (the scalloped blue disc
// with the white wave). Writes ./svg/puzzle-wave-*.svg.
import { writeFileSync, mkdirSync } from "node:fs";
import * as K from "../v2/kit.mjs";

const OUT = new URL("./svg/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const TAU = Math.PI * 2;
const C = { blue: "#2F6BFF", yellow: "#FFC23D", violet: "#7B61FF", sky: "#2EC5FF", deep: "#1F3FD1", white: "#FFFFFF" };

// ---------- the kit: a squircle cut by two wavy seams ----------
const R = 508, M = 5;
const tile = (x, y) => { const u = Math.abs(x - 512) / R, v = Math.abs(y - 512) / R; return ((u ** M + v ** M) ** (1 / M) - 1) * R; };
const seams = ({ amp = 42, period = 400, hAmp = amp, hPeriod = period } = {}) => ({
  sx: (y) => 512 + amp * Math.sin((TAU * (y - 112)) / period),
  sy: (x) => 512 - hAmp * Math.sin((TAU * (x - 112)) / hPeriod),
});
// quadrant field: a = +1 left / -1 right, b = +1 top / -1 bottom
const quad = (S, a, b, gap = 13, hGap = gap, round = 18) => (x, y) =>
  K.smax(K.smax(tile(x, y), a * (x - S.sx(y)) + gap, round), b * (y - S.sy(x)) + hGap, round);
const QUADS = [[1, 1], [-1, 1], [1, -1], [-1, -1]]; // TL, TR, BL, BR

// ---------- the voice-wave icon: scalloped disc + white sine with round caps ----------
const disc = (cx, cy, r) => {
  const P = Array.from({ length: 900 }, (_, i) => { const t = (i / 900) * TAU, rr = r * (1 + 0.034 * Math.cos(12 * t) - 0.012 * Math.cos(24 * t)); return [cx + rr * Math.sin(t), cy - rr * Math.cos(t)]; });
  return K.polyPath(P, 3);
};
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const wave = (cx, cy, w, amp, sw, color = C.white) => {
  const p = Array.from({ length: 121 }, (_, i) => { const u = i / 120; return [cx - w / 2 + w * u, cy - amp * Math.sin(TAU * 2 * u)]; });
  return `<path d="M${p.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L")}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
};
// the icon at radius r: proportions of the round-3 blue disc (wave 1.2 r wide, 0.23 r tall, 0.19 r thick)
const voiceIcon = (cx, cy, r, shadowId) =>
  `<path d="${disc(cx, cy, r)}" fill="${C.blue}"${shadowId ? ` filter="url(#${shadowId})"` : ""}/>` + wave(cx, cy, r * 1.2, r * 0.23, r * 0.19);
const shadow = (id) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#06070A" flood-opacity="0.28"/></filter>`;
const centroid = (f) => { let sx = 0, sy = 0, n = 0; for (let y = 0; y <= 1024; y += 4) for (let x = 0; x <= 1024; x += 4) if (f(x, y) < 0) { sx += x; sy += y; n++; } return [sx / n, sy / n]; };
const paths = (fields, fills) => fields.map((f, i) => `<path d="${K.shapePath(f)}" fill="${fills[i]}"/>`).join("\n");
const write = (name, defs, body) => writeFileSync(new URL(`${name}.svg`, OUT), K.svg(defs, body));

// 1 · Voice piece: the blue piece of the kit carries the voice wave
function voicePiece() {
  const S = seams(), F = QUADS.map(([a, b]) => quad(S, a, b));
  const [cx, cy] = centroid(F[0]);
  write("puzzle-wave-1-voice-piece", "", paths(F, [C.blue, C.yellow, C.violet, C.sky]) + "\n" + wave(cx + 6, cy + 4, 236, 46, 40));
}

// 2 · Voice hub: the voice-wave icon sits where the four pieces meet and holds the kit together
function voiceHub() {
  const S = seams(), r = 168, hole = (x, y) => -(Math.hypot(x - 512, y - 512) - (r * 1.05 + 26));
  const F = QUADS.map(([a, b]) => { const q = quad(S, a, b); return (x, y) => K.smax(q(x, y), hole(x, y), 16); });
  write("puzzle-wave-2-voice-hub", shadow("hub-sh"), paths(F, [C.sky, C.yellow, C.violet, C.deep]) + "\n" + voiceIcon(512, 512, r, "hub-sh"));
}

// 3 · Voice corner: the voice-wave icon is the kit's first piece; the other three fit round it
function voiceCorner() {
  const S = seams(), cx = 286, cy = 286, r = 232, hole = (x, y) => -(Math.hypot(x - cx, y - cy) - (r * 1.05 + 24));
  const F = QUADS.slice(1).map(([a, b]) => { const q = quad(S, a, b); return (x, y) => K.smax(q(x, y), hole(x, y), 16); });
  write("puzzle-wave-3-voice-corner", shadow("cor-sh"), paths(F, [C.yellow, C.violet, C.sky]) + "\n" + voiceIcon(cx, cy, r, "cor-sh"));
}

// 4 · Wave seam: the seam between the top and bottom pieces is the voice wave itself, drawn white
function waveSeam() {
  const hAmp = 70, hPeriod = 470, sw = 46;
  const S = seams({ hAmp, hPeriod });
  const F = QUADS.map(([a, b]) => quad(S, a, b, 13, sw / 2 + 2));
  const p = Array.from({ length: 161 }, (_, i) => { const x = -10 + (1044 * i) / 160; return [x, S.sy(x)]; });
  const line = `<path d="M${p.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L")}" fill="none" stroke="${C.white}" stroke-width="${sw}" stroke-linecap="round" clip-path="url(#seam-c)"/>`;
  const clip = `<clipPath id="seam-c"><path d="${K.shapePath(tile)}"/></clipPath>`;
  write("puzzle-wave-4-wave-seam", clip, paths(F, [C.blue, C.yellow, C.violet, C.sky]) + "\n" + line);
}

voicePiece(); voiceHub(); voiceCorner(); waveSeam();
console.log("written puzzle-wave-1..4");
