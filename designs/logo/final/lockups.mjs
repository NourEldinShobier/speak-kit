// Wordmark and lockups for the final SpeakKit logo. The wordmark is "SpeakKit" in Inter Semi Bold
// (variable font, wght 600, opsz 32, tracking -2 %), outlined to paths so the files need no font.
// Usage: node lockups.mjs [path/to/Inter-Variable.ttf]   (default: the per-user Windows font folder)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../v2/package.json", import.meta.url));
const fontkit = require("fontkit");
const FONT = process.argv[2] || `${process.env.LOCALAPPDATA}/Microsoft/Windows/Fonts/Inter-Variable.ttf`;
const font = fontkit.openSync(FONT).getVariation({ wght: 600, opsz: 32 });
const DIR = new URL("./svg/logo/", import.meta.url);
const INK = "#14161B", WHITE = "#FFFFFF";
const f1 = (v) => (Math.round(v * 100) / 100).toString();

// "SpeakKit" at `size` px with its baseline at y = 0 and left edge at x = 0
function word(size, color) {
  const s = size / font.unitsPerEm, track = -0.02 * size, run = font.layout("SpeakKit");
  let x = 0;
  const d = run.glyphs.map((g, i) => {
    const p = g.path.scale(s, -s).translate(x + run.positions[i].xOffset * s, 0).toSVG();
    x += run.positions[i].xAdvance * s + track;
    return p;
  }).join("");
  return { body: `<path d="${d}" fill="${color}"/>`, width: x - track, cap: font.capHeight * s, desc: -font.descent * s };
}

// the colour mark (1024 canvas) placed at (x, y) with side h
const markSvg = readFileSync(new URL("speakkit-logo.svg", DIR), "utf8");
const markInner = markSvg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const mark = (x, y, h) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(h / 1024)})">${markInner}</g>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="0 0 ${f1(w)} ${f1(h)}">\n${body}\n</svg>\n`;

for (const [tone, color] of [["ink", INK], ["white", WHITE]]) {
  // horizontal: mark 200, gap 44, wordmark 128 with its cap height centred on the mark
  { const H = 200, G = 44, w = word(128, color), base = H / 2 + w.cap / 2;
    writeFileSync(new URL(`speakkit-lockup-horizontal-${tone}.svg`, DIR), svg(H + G + w.width, H, `${mark(0, 0, H)}<g transform="translate(${H + G} ${f1(base)})">${w.body}</g>`)); }
  // stacked: mark 220 centred over a 96 px wordmark
  { const H = 220, G = 30, w = word(96, color), W = Math.max(H, w.width), base = H + G + w.cap;
    writeFileSync(new URL(`speakkit-lockup-stacked-${tone}.svg`, DIR), svg(W, base + w.desc, `${mark((W - H) / 2, 0, H)}<g transform="translate(${f1((W - w.width) / 2)} ${f1(base)})">${w.body}</g>`)); }
  // wordmark alone, cap top to descender
  { const w = word(128, color);
    writeFileSync(new URL(`speakkit-wordmark-${tone}.svg`, DIR), svg(w.width, w.cap + w.desc, `<g transform="translate(0 ${f1(w.cap)})">${w.body}</g>`)); }
}
console.log("written lockups and wordmarks for ink and white");
