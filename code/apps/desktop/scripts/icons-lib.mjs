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

/** The logo inside a 1024 px canvas with the 100 px margin macOS app icons have (the Dock does not mask icons). */
export function macIconPng() {
  const inner = svgOf("logo").replace('width="1024" height="1024"', 'x="100" y="100" width="824" height="824"');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
  return new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render().asPng();
}

/** Menu-bar template image: the logo tile in black with the white wave cut out; macOS tints it for light, dark and highlighted bars. */
export function trayTemplatePng(size, opacity = 1) {
  const svg = svgOf("logo-small");
  const wave = svg.match(/<path [^>]*stroke="#FFFFFF"[^>]*\/>/)[0];
  const cut = wave.replace('stroke="#FFFFFF"', 'stroke="#000"');
  const tile = svg.replace(wave, "").replace(/fill="#[0-9A-Fa-f]{6}"/g, 'fill="#000"');
  const mask = `<mask id="cut"><rect width="1024" height="1024" fill="#fff"/>${cut}</mask><g mask="url(#cut)" opacity="${opacity}">`;
  const out = tile.replace(/(<svg [^>]*>)/, `$1${mask}`).replace("</svg>", "</g></svg>");
  return new Resvg(out, { fitTo: { mode: "width", value: size } }).render().asPng();
}

/** Menu-bar image at 2x for `state`: a template for normal and asleep, the coloured logo with its dot for the others. */
export const trayMacPng = (state) => (state === "normal" ? trayTemplatePng(36) : state === "asleep" ? trayTemplatePng(36, 0.45) : logoPng(36, state));
