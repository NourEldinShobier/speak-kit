// Rasterises the Voice hub logo SVGs (packages/ui/assets/logo) for the app icon, the tray and the installer .ico.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const svgOf = (name) => readFileSync(fileURLToPath(new URL(`../../../packages/ui/assets/logo/${name}.svg`, import.meta.url)), "utf8");
/** Corner dot colour per tray state (states not listed have no dot). "asleep" is the logo in greyscale. */
export const BADGES = { working: "#4A9EFF", error: "#F2555A", paused: "#9AA0AB", attention: "#F59E0B" };
const DOT = { c: 778, r: 246, ring: 61 }; // bottom-right corner dot on the 1024 canvas

/** PNG bytes of the logo at `size` px: small variant up to 48 px, full above; tray `state` adds the dot or greyscale. */
export function logoPng(size, state = "normal") {
  let svg = svgOf(size <= 48 ? "logo-small" : "logo");
  if (state === "asleep") {
    svg = svg
      .replace("<defs>", `<defs><filter id="grey"><feColorMatrix type="saturate" values="0"/></filter>`)
      .replace("</defs>\n", `</defs>\n<g filter="url(#grey)">`)
      .replace("\n</svg>", "</g>\n</svg>");
  } else if (BADGES[state]) {
    const { c, r, ring } = DOT;
    svg = svg.replace("\n</svg>", `<circle cx="${c}" cy="${c}" r="${r}" fill="#FFFFFF"/><circle cx="${c}" cy="${c}" r="${r - ring}" fill="${BADGES[state]}"/>\n</svg>`);
  }
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
