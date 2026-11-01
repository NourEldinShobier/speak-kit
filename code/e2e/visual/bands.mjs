// usage: node bands.mjs A1 [x0 x1]  -> vertical bands of content in design vs built crops
import { PNG } from "pngjs";
import fs from "fs";
const id = process.argv[2];
const x0 = +(process.argv[3] || 6),
  x1 = +(process.argv[4] || 350);
const load = (p) => PNG.sync.read(fs.readFileSync(p));
const bands = (p) => {
  const out = [];
  let s = -1;
  for (let y = 0; y < p.height; y++) {
    const bg = (() => {
      const i = (y * p.width + 2) * 4;
      return [p.data[i], p.data[i + 1], p.data[i + 2]];
    })();
    let ink = false;
    for (let x = x0; x < x1 && !ink; x++) {
      const i = (y * p.width + x) * 4;
      if (Math.abs(p.data[i] - bg[0]) + Math.abs(p.data[i + 1] - bg[1]) + Math.abs(p.data[i + 2] - bg[2]) > 40) ink = true;
    }
    if (ink && s < 0) s = y;
    if (!ink && s >= 0) {
      out.push([s, y - 1]);
      s = -1;
    }
  }
  if (s >= 0) out.push([s, p.height - 1]);
  return out;
};
const d = bands(load(`out/design/${id}.png`)).filter((b) => b[1] > 8),
  b = bands(load(`out/built/${id}.png`));
const n = Math.max(d.length, b.length);
for (let i = 0; i < n; i++) console.log((d[i] || []).join("-").padEnd(10), (b[i] || []).join("-").padEnd(10), d[i] && b[i] ? b[i][0] - d[i][0] : "");
