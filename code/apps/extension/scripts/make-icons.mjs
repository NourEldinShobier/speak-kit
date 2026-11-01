// Generates public/icons/{16,32,48,128}.png from the Voice hub logo SVGs in packages/ui/assets/logo (small variant up to 48 px).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const src = (name) => readFileSync(fileURLToPath(new URL(`../../../packages/ui/assets/logo/${name}.svg`, import.meta.url)), "utf8");
const out = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(out, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const svg = src(size <= 48 ? "logo-small" : "logo");
  writeFileSync(`${out}${size}.png`, new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng());
}
console.log("icons written to", out);
