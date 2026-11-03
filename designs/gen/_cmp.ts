// bun _cmp.ts <ID> <shotPath> <x,y,w,h>   Fidelity check of a frame against a built shot.
// ROOT/screens/<ID>.png (export scale SCALE, default 2) is cropped to the frame rect x,y,w,h (design px, frame-local),
// resized to the shot size, and written next to the shot as ROOT/cmp/<ID>.png = shot | frame crop | absolute difference (x4 boosted).
// Prints mean abs difference per channel (0..255) and the % of pixels differing by more than 24.
import { mkdirSync } from "fs";
const sharp = (await import(`${import.meta.dir}/../../code/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js`)).default;
const [id, shotPath, rect] = process.argv.slice(2);
if (!id || !shotPath || !rect) { console.log("usage: bun _cmp.ts <ID> <shotPath> <x,y,w,h>   (env ROOT, SCALE=2)"); process.exit(1); }
const ROOT = process.env.ROOT ?? `${import.meta.dir}/../next`; const SC = Number(process.env.SCALE ?? 2);
const [x, y, w, h] = rect.split(",").map(Number);
const shot = sharp(shotPath).removeAlpha(); const { width: sw, height: sh } = await shot.metadata();
const a = await shot.raw().toBuffer();
const b = await sharp(`${ROOT}/screens/${id}.png`).extract({ left: Math.round(x * SC), top: Math.round(y * SC), width: Math.round(w * SC), height: Math.round(h * SC) }).resize(sw, sh, { kernel: "lanczos3", fit: "fill" }).removeAlpha().raw().toBuffer();
const d = Buffer.alloc(a.length); let sum = 0, bad = 0;
for (let i = 0; i < a.length; i += 3) { let m = 0; for (let c = 0; c < 3; c++) { const v = Math.abs(a[i + c] - b[i + c]); sum += v; m = Math.max(m, v); d[i + c] = Math.min(255, v * 4); } if (m > 24) bad++; }
mkdirSync(`${ROOT}/cmp`, { recursive: true });
const G = 8, ch = { width: sw, height: sh, channels: 3 as const };
await sharp({ create: { width: sw * 3 + G * 2, height: sh, channels: 3, background: "#ff00ff" } }).composite([
  { input: a, raw: ch, left: 0, top: 0 }, { input: b, raw: ch, left: sw + G, top: 0 }, { input: d, raw: ch, left: (sw + G) * 2, top: 0 }]).png().toFile(`${ROOT}/cmp/${id}.png`);
console.log(`${id}: mean diff ${(sum / a.length).toFixed(3)} / 255, ${((bad / (a.length / 3)) * 100).toFixed(2)}% pixels > 24, ${ROOT}/cmp/${id}.png`);
