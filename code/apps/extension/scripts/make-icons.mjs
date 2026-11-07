// Squircle edge to edge up to 48 px; 94 % of the frame at 128 px (store and install dialogs).
// Generates public/icons/{16,32,48,128}.png from the logo SVGs in packages/ui/assets/logo (small variant up to 48 px).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const src = (name) => readFileSync(fileURLToPath(new URL(`../../../packages/ui/assets/logo/${name}.svg`, import.meta.url)), "utf8");
const out = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(out, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  let svg = src(size <= 48 ? "logo-small" : "logo");
  // white squircle under the pieces so the seams are white, not holes
  svg = svg.replace("</defs>\n", `</defs>\n<path transform="translate(1 1) scale(0.998)" d="${svg.match(/<clipPath id="sq"><path d="([^"]+)"/)[1]}" fill="#FFFFFF"/>\n`);
  if (size > 48)
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${svg.replace('width="1024" height="1024"', 'x="30.72" y="30.72" width="962.56" height="962.56"')}</svg>`;
  writeFileSync(`${out}${size}.png`, new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng());
}
console.log("icons written to", out);
