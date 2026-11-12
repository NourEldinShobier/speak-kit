// Rasterises the logo SVGs for the app icon, the tray and the installer .ico.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const read = (name) => readFileSync(fileURLToPath(new URL(`../../../packages/ui/assets/logo/${name}.svg`, import.meta.url)), "utf8");
/** The logo svg. With `tile`, a white squircle (1 px smaller, to avoid a pale fringe) sits under the pieces so the seams are white, not holes: app, tray and installer icons need a solid container; the in-app logo and the menu-bar template keep transparent seams. */
const svgOf = (name, tile = false, tileColor = "#FFFFFF") => {
  const svg = read(name);
  const clip = svg.match(/<clipPath id="sq"><path d="([^"]+)"/)[1];
  return tile ? svg.replace("</defs>\n", `</defs>\n<path transform="translate(1 1) scale(0.998)" d="${clip}" fill="${tileColor}"/>\n`) : svg;
};
/** Corner dot colour per tray state (states not listed have no dot). "asleep" is the logo in greyscale. */
export const BADGES = { working: "#4A9EFF", error: "#F2555A", paused: "#9AA0AB", attention: "#F59E0B" };
const DOT = { c: 778, r: 246, ring: 61 }; // bottom-right corner dot on the 1024 canvas

/** PNG bytes of the logo at `size` px: small variant up to 48 px, full above; tray `state` adds the dot or greyscale. */
/** Under the pieces of the dark-taskbar variants. */
export const DARK_TILE = "#26242B";

export function logoPng(size, state = "normal", dark = false) {
  const tile = dark ? DARK_TILE : "#FFFFFF";
  let svg = svgOf(size <= 48 ? "logo-small" : "logo", true, tile);
  if (state === "asleep") {
    svg = svg
      .replace("<defs>", `<defs><filter id="grey"><feColorMatrix type="saturate" values="0"/></filter>`)
      .replace("</defs>\n", `</defs>\n<g filter="url(#grey)">`)
      .replace("\n</svg>", "</g>\n</svg>");
  } else if (BADGES[state]) {
    const { c, r, ring } = DOT;
    svg = svg.replace("\n</svg>", `<circle cx="${c}" cy="${c}" r="${r}" fill="${tile}"/><circle cx="${c}" cy="${c}" r="${r - ring}" fill="${BADGES[state]}"/>\n</svg>`);
  }
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** The logo svg placed inside a 1024 px canvas at `frac` of its width (centred), under optional extra markup. */
const inset = (svg, frac, under = "") => {
  const side = 1024 * frac,
    off = (1024 - side) / 2;
  const inner = svg.replace('width="1024" height="1024"', `x="${off}" y="${off}" width="${side}" height="${side}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${under}${inner}</svg>`;
};
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();

/** macOS app icon: the Big Sur grid. The squircle body is 824 px on a 1024 canvas (100 px transparent margin), with Apple's soft shadow (10 px down, blur 20, 30 % black) baked in because macOS does not mask or shadow icons. */
export function macIconSvg() {
  const full = svgOf("logo", true),
    clip = full.match(/<clipPath id="sq"><path d="([^"]+)"/)[1];
  const shadow = `<defs><filter id="mac-sh" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="10"/><feOffset dy="10"/><feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer></filter></defs><g filter="url(#mac-sh)"><path transform="translate(100 100) scale(0.8047)" d="${clip}" fill="#000"/></g>`;
  return inset(full, 824 / 1024, shadow);
}
export const macIconPng = () => png(macIconSvg(), 1024);

/** Windows installer icon frame: the squircle at 94 % of the frame from 48 px up, edge to edge at 16, 24 and 32 px where every pixel counts. */
export const winIconPng = (size) => png(inset(svgOf(size <= 48 ? "logo-small" : "logo", true), size <= 32 ? 1 : 0.94), size);

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
