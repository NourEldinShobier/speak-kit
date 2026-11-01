// usage: node px.mjs <design|built> ID x y [x y ...]
import { PNG } from "pngjs";
import fs from "fs";
const [, , kind, id, ...xy] = process.argv;
const p = PNG.sync.read(fs.readFileSync(`out/${kind}/${id}.png`));
for (let i = 0; i < xy.length; i += 2) {
  const x = +xy[i],
    y = +xy[i + 1];
  const k = (y * p.width + x) * 4;
  const h = [0, 1, 2].map((j) => p.data[k + j].toString(16).padStart(2, "0")).join("");
  console.log(x, y, "#" + h);
}
