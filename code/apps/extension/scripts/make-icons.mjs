// Generates public/icons/{16,32,48,128}.png: waveform bars on a blue rounded square (the SpeakKit logo mark).
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
};

/** signed distance to a rounded rect centered at (cx,cy) with half sizes (hw,hh) and radius r */
const sdRound = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - (hw - r);
  const qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

function render(size) {
  const SS = 4;
  const heights = [0.28, 0.5, 0.7, 0.42, 0.22];
  const bw = Math.max(2, size * 0.08);
  const gap = Math.max(1.5, size * 0.07);
  const total = heights.length * bw + (heights.length - 1) * gap;
  const x0 = (size - total) / 2;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let a = 0,
        bar = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS,
            y = py + (sy + 0.5) / SS;
          if (sdRound(x, y, size / 2, size / 2, size / 2, size / 2, size * 0.28) > 0) continue;
          a++;
          for (let i = 0; i < heights.length; i++) {
            const h = size * heights[i];
            if (
              sdRound(
                x,
                y,
                x0 + i * (bw + gap) + bw / 2,
                size / 2,
                bw / 2,
                h / 2,
                Math.min(size * 0.04, bw / 2),
              ) <= 0
            ) {
              bar++;
              break;
            }
          }
        }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const n = SS * SS;
      const f = a ? bar / a : 0; // white share inside the square
      raw[o] = Math.round(0x24 + (255 - 0x24) * f);
      raw[o + 1] = Math.round(0x57 + (255 - 0x57) * f);
      raw[o + 2] = Math.round(0xf5 + (255 - 0xf5) * f);
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [16, 32, 48, 128]) writeFileSync(join(out, `${s}.png`), render(s));
console.log("icons written to", out);
