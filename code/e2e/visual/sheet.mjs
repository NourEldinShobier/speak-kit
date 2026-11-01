// usage: node sheet.mjs <out.png> <cellWidth> <key> [key ...]   key = <id>-<state>-<theme>; each row is design | built, scaled to cellWidth
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PNG } from "pngjs";
const [, , outFile, cw, ...keys] = process.argv;
const W = +cw;
const read = (p) => (existsSync(p) ? PNG.sync.read(readFileSync(p)) : null);
const scale = (p) => {
  const f = Math.min(1, W / p.width);
  const w = Math.max(1, Math.round(p.width * f)),
    h = Math.max(1, Math.round(p.height * f));
  const o = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / f),
        x1 = Math.max(x0 + 1, Math.floor((x + 1) / f)),
        y0 = Math.floor(y / f),
        y1 = Math.max(y0 + 1, Math.floor((y + 1) / f));
      const s = [0, 0, 0, 0];
      let c = 0;
      for (let yy = y0; yy < Math.min(p.height, y1); yy++)
        for (let xx = x0; xx < Math.min(p.width, x1); xx++) {
          for (let k = 0; k < 4; k++) s[k] += p.data[(yy * p.width + xx) * 4 + k];
          c++;
        }
      for (let k = 0; k < 4; k++) o.data[(y * w + x) * 4 + k] = Math.round(s[k] / Math.max(1, c));
    }
  return o;
};
const rows = keys.map((k) => ({ d: read(`out/design/${k}.png`), b: read(`out/built/${k}.png`) })).map((r) => ({ d: r.d && scale(r.d), b: r.b && scale(r.b) }));
const H = rows.map((r) => Math.max(r.d?.height ?? 0, r.b?.height ?? 0) + 6);
const out = new PNG({ width: W * 2 + 6, height: H.reduce((a, b) => a + b, 0) });
out.data.fill(120);
let y = 0;
rows.forEach((r, i) => {
  if (r.d) PNG.bitblt(r.d, out, 0, 0, r.d.width, r.d.height, 0, y);
  if (r.b) PNG.bitblt(r.b, out, 0, 0, r.b.width, r.b.height, W + 6, y);
  y += H[i];
});
writeFileSync(outFile, PNG.sync.write(out));
console.log(out.width, out.height);
