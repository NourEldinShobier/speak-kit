// Builds use_figma scripts that import logo SVGs as components and fill the review cards.
// Usage: node designs/logo/tools/figma-batch.mjs <cards.json> <outDir> [perBatch=4]
// cards.json: [{ slug, cardId, title, idea }]  -> <outDir>/batch-N.js (each under the 50 000-char tool limit)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [cardsFile, outDir, per = "4"] = process.argv.slice(2);
const cards = JSON.parse(readFileSync(cardsFile, "utf8"));
mkdirSync(outDir, { recursive: true });

// Minify: drop comments/whitespace and round long decimals; geometry stays exact to 0.01 px on a 1024 canvas.
const minify = (svg) =>
  svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(\d+\.\d{2})\d+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

const header = `await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const solid = (h) => [{ type: "SOLID", color: hex(h) }];
let masters = figma.currentPage.findOne((n) => n.type === "FRAME" && n.name === "Masters");
if (!masters) {
  masters = figma.createAutoLayout("HORIZONTAL", { name: "Masters", itemSpacing: 32 });
  masters.layoutWrap = "WRAP"; masters.counterAxisSpacing = 32;
  masters.paddingLeft = masters.paddingRight = masters.paddingTop = masters.paddingBottom = 48;
  masters.fills = solid("#2A2B2F"); masters.cornerRadius = 24;
  const w = await figma.getNodeByIdAsync("1:2");
  masters.x = w.x; masters.y = w.y + w.height + 200;
  masters.resize(5 * 256 + 4 * 32 + 96, 100); masters.layoutSizingHorizontal = "FIXED"; masters.layoutSizingVertical = "HUG";
}
const tile = (bg, size) => { const f = figma.createAutoLayout("HORIZONTAL", { name: bg === "#0B0C0E" ? "on dark" : "on light" });
  f.primaryAxisAlignItems = "CENTER"; f.counterAxisAlignItems = "CENTER"; f.fills = solid(bg); f.cornerRadius = 14; return f; };
const created = [];
async function fill({ slug, cardId, title, idea, svg }) {
  const card = await figma.getNodeByIdAsync(cardId);
  for (const c of [...card.children]) c.remove();
  const node = figma.createNodeFromSvg(svg);
  node.name = slug; node.rescale(0.25);
  const comp = figma.createComponentFromNode(node);
  comp.name = "Logo/" + slug;
  comp.description = idea;
  masters.appendChild(comp);
  const row = figma.createAutoLayout("HORIZONTAL", { name: "Previews", itemSpacing: 12 });
  row.fills = [];
  for (const bg of ["#0B0C0E", "#F4F4F2"]) {
    const t = tile(bg); row.appendChild(t); t.resize(274, 274); t.layoutSizingHorizontal = "FIXED"; t.layoutSizingVertical = "FIXED";
    const i = comp.createInstance(); i.rescale(240 / 256); t.appendChild(i);
  }
  card.appendChild(row);
  const sizes = figma.createAutoLayout("HORIZONTAL", { name: "True sizes", itemSpacing: 12 });
  sizes.fills = [];
  for (const bg of ["#0B0C0E", "#F4F4F2"]) {
    const t = tile(bg); t.itemSpacing = 22; t.paddingLeft = t.paddingRight = 18; t.paddingTop = t.paddingBottom = 14;
    for (const px of [64, 32, 16]) { const i = comp.createInstance(); i.rescale(px / 256); t.appendChild(i); }
    sizes.appendChild(t); t.layoutSizingHorizontal = "FILL";
  }
  card.appendChild(sizes); sizes.layoutSizingHorizontal = "FILL";
  const h = figma.createText(); h.fontName = { family: "Inter", style: "Semi Bold" }; h.characters = title; h.fontSize = 20; h.fills = solid("#FFFFFF");
  card.appendChild(h);
  const p = figma.createText(); p.fontName = { family: "Inter", style: "Regular" }; p.characters = idea; p.fontSize = 14; p.fills = solid("#9A9AA0");
  card.appendChild(p); p.textAutoResize = "HEIGHT"; p.layoutSizingHorizontal = "FILL";
  card.layoutSizingVertical = "HUG";
  card.placeholder = false;
  created.push({ slug, cardId, componentId: comp.id });
}
`;

const batches = [];
for (let i = 0; i < cards.length; i += Number(per)) batches.push(cards.slice(i, i + Number(per)));
batches.forEach((b, n) => {
  const calls = b
    .map((c) => {
      const svg = minify(readFileSync(resolve(here, "../svg", `${c.slug}.svg`), "utf8"));
      return `await fill(${JSON.stringify({ ...c, svg })});`;
    })
    .join("\n");
  const code = `${header}\n${calls}\nreturn { created };`;
  const file = join(outDir, `batch-${n + 1}.js`);
  writeFileSync(file, code);
  console.log(file, code.length, "chars", code.length > 49000 ? "TOO LONG" : "");
});
