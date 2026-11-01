// Line-weight test: make the seams and the ring round the hub as thick as the wave. Writes ./svg/test/.
import { writeFileSync, mkdirSync } from "node:fs";
import { SIZES, geometry, colour } from "./logo.mjs";

const OUT = new URL("./svg/test/", import.meta.url);
mkdirSync(OUT, { recursive: true });
// even(p, k): wave thickness k·r, seams and ring the same thickness
const even = (p, k = p.waveS) => ({ ...p, waveS: k, gap: (p.r * k) / 2, ring: p.r * k });
const options = {
  "a-current": SIZES.full,
  "b-even": even(SIZES.full),
  "c-even-lighter": even(SIZES.full, 0.15),
  "a-current-small": SIZES.small,
  "b-even-small": even(SIZES.small),
  "c-even-lighter-small": even(SIZES.small, 0.22),
};
for (const [n, p] of Object.entries(options)) writeFileSync(new URL(`line-${n}.svg`, OUT), colour(geometry(p), { withShadow: !n.endsWith("small") }));
console.log(Object.entries(options).map(([n, p]) => `${n}: wave ${(p.r * p.waveS).toFixed(0)} px, seams ${(2 * p.gap).toFixed(0)} px, ring ${p.ring.toFixed(0)} px`).join("\n"));
