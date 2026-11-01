import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { DESIGNS, OUT } from "./support";

export interface Crop { x: number; y: number; w: number; h: number }
export interface Result { id: string; state: string; theme: "dark" | "light"; group: string; title: string; file: string; design?: string; w?: number; h?: number; diffPct?: number; diffPx?: number; inkPct?: number; note?: string }

const read = (p: string) => PNG.sync.read(readFileSync(p));
const crop = (src: PNG, c: Crop): PNG => {
  const out = new PNG({ width: c.w, height: c.h });
  PNG.bitblt(src, out, c.x, c.y, Math.max(0, Math.min(c.w, src.width - c.x)), Math.max(0, Math.min(c.h, src.height - c.y)), 0, 0);
  return out;
};
/** The design PNGs are 2x renders of a 1440x900 frame; compare at 1x (2x2 box average). */
export function half(src: PNG): PNG {
  const w = src.width >> 1, h = src.height >> 1;
  const o = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let k = 0; k < 4; k++) {
        const s = (a: number, b: number) => src.data[((y * 2 + b) * src.width + x * 2 + a) * 4 + k]!;
        o.data[(y * w + x) * 4 + k] = (s(0, 0) + s(1, 0) + s(0, 1) + s(1, 1) + 2) >> 2;
      }
  return o;
}
const px = (p: PNG, x: number, y: number) => { const i = (y * p.width + x) * 4; return [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!]; };
const near = (a: number[], b: number[], t = 6) => Math.abs(a[0]! - b[0]!) <= t && Math.abs(a[1]! - b[1]!) <= t && Math.abs(a[2]! - b[2]!) <= t;

/** Where the built screen sits inside the (1x) design frame. Window 1280x800 at (80,50); browser viewport 1278x718 at (81,131); popup card 360 px wide at (264,264). */
export function designCrop(id: string, d: PNG): Crop {
  if (/^A\d/.test(id)) {
    const border = px(d, 264, 330);
    let yTop = 330, yEnd = 330;
    while (yTop > 100 && near(px(d, 264, yTop - 1), border, 10)) yTop--;
    while (yEnd < 880 && near(px(d, 264, yEnd + 1), border, 10)) yEnd++;
    let top = yTop, bottom = yEnd + 1;
    for (let y = Math.max(0, yTop - 16); y <= yTop + 2; y++) if (near(px(d, 444, y), border, 8)) { top = y; break; }
    for (let y = Math.max(300, yEnd - 2); y < Math.min(d.height, yEnd + 16); y++) if (near(px(d, 444, y), border, 8)) { bottom = y + 1; break; }
    return { x: 264, y: top, w: 360, h: bottom - top };
  }
  if (id === "C9" || id === "C10") return { x: 960, y: 131, w: 399, h: 718 };
  if (/^W\d/.test(id)) return { x: 241, y: 91, w: 958, h: 678 };
  if (id === "L4") return { x: 209, y: 67, w: 1013, h: 766 };
  if (id === "C18") return { x: 121, y: 131, w: 758, h: 718 };
  if (/^[BC]\d/.test(id)) return { x: 81, y: 131, w: 1278, h: 718 };
  return { x: 81, y: 51, w: 1278, h: 798 };
}

/** The design file a capture answers: dark is the default theme, light twins carry the -L suffix. */
export function designFile(id: string, dark: boolean): string | null {
  const f = join(DESIGNS, dark ? `${id}.png` : `${id}-L.png`);
  return existsSync(f) ? f : null;
}

export function compare(r: Omit<Result, "diffPct">, builtPath: string, designPath: string | null): Result {
  const key = `${r.id}-${r.state}-${r.theme}`;
  mkdirSync(join(OUT, "diff"), { recursive: true });
  mkdirSync(join(OUT, "sbs"), { recursive: true });
  mkdirSync(join(OUT, "design"), { recursive: true });
  if (!designPath) return { ...r, note: "no design for this theme" } as Result;
  const dfull = half(read(designPath));
  const d = crop(dfull, designCrop(r.id, dfull));
  writeFileSync(join(OUT, "design", `${key}.png`), PNG.sync.write(d));
  const b0 = read(builtPath);
  const w = Math.max(d.width, b0.width);
  const h = Math.max(d.height, b0.height);
  const pad = (p: PNG) => {
    const o = new PNG({ width: w, height: h });
    o.data.fill(255);
    PNG.bitblt(p, o, 0, 0, p.width, p.height, 0, 0);
    return o;
  };
  const a = pad(d);
  const b = pad(b0);
  const diff = new PNG({ width: w, height: h });
  const diffPx = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.2, includeAA: false });
  writeFileSync(join(OUT, "diff", `${key}.png`), PNG.sync.write(diff));
  const stack = w > 700;
  const sbs = new PNG({ width: stack ? w : w * 3 + 16, height: stack ? h * 2 + 8 : h });
  sbs.data.fill(128);
  PNG.bitblt(a, sbs, 0, 0, w, h, 0, 0);
  if (stack) PNG.bitblt(b, sbs, 0, 0, w, h, 0, h + 8);
  else { PNG.bitblt(b, sbs, 0, 0, w, h, w + 8, 0); PNG.bitblt(diff, sbs, 0, 0, w, h, (w + 8) * 2, 0); }
  writeFileSync(join(OUT, "sbs", `${key}.png`), PNG.sync.write(sbs));
  const note = d.width !== b0.width || d.height !== b0.height ? `size design ${d.width}x${d.height} built ${b0.width}x${b0.height}` : undefined;
  // share of differing pixels among the pixels that are not background in either image (dark pages are mostly background, which flatters diffPct)
  const bg = (p: PNG) => { const m = new Map<number, number>(); for (let i = 0; i < p.data.length; i += 4 * 7) { const k = (p.data[i]! << 16) | (p.data[i + 1]! << 8) | p.data[i + 2]!; m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((x, y) => y[1] - x[1])[0]![0]; };
  const bgA = bg(a), bgB = bg(b);
  let ink = 0;
  for (let i = 0; i < a.data.length; i += 4) { const ka = (a.data[i]! << 16) | (a.data[i + 1]! << 8) | a.data[i + 2]!; const kb = (b.data[i]! << 16) | (b.data[i + 1]! << 8) | b.data[i + 2]!; if (ka !== bgA || kb !== bgB) ink++; }
  return { ...r, w, h, diffPx, diffPct: +((diffPx / (w * h)) * 100).toFixed(2), inkPct: +((diffPx / Math.max(1, ink)) * 100).toFixed(1), note };
}
