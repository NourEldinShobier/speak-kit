// Renders a logo SVG into a review sheet: large on dark and light, plus true-size 128/48/32/16 px and a 16 px blow-up.
// Usage: node designs/logo/tools/render.mjs <file.svg> [more.svg ...]   -> designs/logo/renders/<name>-sheet.png
//        node designs/logo/tools/render.mjs --contact <out.png> <a.svg> <b.svg> ...   -> one contact sheet, labelled
// Also prints lint warnings for SVG features that do not survive Figma import or are not allowed in the brief.
import { readFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pw = pathToFileURL(resolve(here, "../../../code/e2e/node_modules/@playwright/test/index.mjs")).href;
const { chromium } = await import(pw);
const outDir = resolve(here, "../renders");
mkdirSync(outDir, { recursive: true });

const DARK = "#0B0C0E";
const LIGHT = "#F4F4F2";

function lint(svg) {
  const w = [];
  if (!/<svg[^>]*viewBox="0 0 1024 1024"/.test(svg)) w.push('root <svg> must have viewBox="0 0 1024 1024"');
  if (!/<svg[^>]*\swidth="1024"/.test(svg) || !/<svg[^>]*\sheight="1024"/.test(svg)) w.push('root <svg> must have width="1024" height="1024"');
  for (const tag of ["text", "image", "style", "foreignObject", "script", "use", "pattern", "feTurbulence", "feDisplacementMap"])
    if (new RegExp(`<${tag}[\\s>/]`).test(svg)) w.push(`<${tag}> is not allowed`);
  if (/href="(?!#)/.test(svg)) w.push("external href is not allowed");
  if (/currentColor/.test(svg)) w.push("currentColor imports as black in Figma; use literal colours");
  const filters = (svg.match(/<filter[\s>]/g) || []).length;
  if (filters > 2) w.push(`${filters} filters: keep at most 2 (glow/shadow only)`);
  return w;
}

const dataUrl = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const sheetHtml = (src, name) => `<!doctype html><html><body style="margin:0;background:#1c1d20;font:12px/1.3 system-ui;color:#aaa">
<div style="display:flex;gap:16px;padding:16px">
  <div style="background:${DARK};width:640px;height:640px;display:grid;place-items:center"><img id="big" src="${src}" width="600" height="600"></div>
  <div style="background:${LIGHT};width:640px;height:640px;display:grid;place-items:center"><img src="${src}" width="600" height="600"></div>
</div>
<div style="display:flex;gap:16px;padding:0 16px 16px">
  ${[DARK, LIGHT].map((bg) => `<div style="background:${bg};width:640px;height:200px;display:flex;align-items:center;justify-content:space-around">
    <img src="${src}" width="128" height="128"><img src="${src}" width="48" height="48"><img src="${src}" width="32" height="32"><img src="${src}" width="16" height="16">
    <canvas class="blow" width="96" height="96" style="image-rendering:pixelated;width:96px;height:96px"></canvas></div>`).join("")}
</div>
<div style="padding:0 16px 12px">${name} — left: on ${DARK}, right: on ${LIGHT}; bottom: true size 128/48/32/16 px and the 16 px render blown up 6x</div>
<script>
const img = new Image(); img.src = ${JSON.stringify(src)};
img.onload = () => { for (const c of document.querySelectorAll('canvas.blow')) {
  const s = document.createElement('canvas'); s.width = 16; s.height = 16; s.getContext('2d').drawImage(img, 0, 0, 16, 16);
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, 96, 96); }
  document.body.dataset.ready = '1'; };
img.onerror = () => { document.body.dataset.ready = 'error'; };
</script></body></html>`;

const contactHtml = (items) => `<!doctype html><html><body style="margin:0;background:#1c1d20;font:600 14px/1.3 system-ui;color:#ddd">
<div style="display:grid;grid-template-columns:repeat(5,300px);gap:12px;padding:12px">
${items.map(({ src, name }) => `<div><div style="display:flex">
  <div style="background:${DARK};width:150px;height:150px;display:grid;place-items:center"><img src="${src}" width="136" height="136"></div>
  <div style="background:${LIGHT};width:150px;height:150px;display:grid;place-items:center"><img src="${src}" width="136" height="136"></div></div>
  <div style="display:flex;gap:10px;align-items:center;padding:6px 4px;background:${DARK}"><img src="${src}" width="32" height="32"><img src="${src}" width="16" height="16"><span>${name}</span></div></div>`).join("")}
</div><script>Promise.all([...document.images].map(i => i.decode().catch(() => {}))).then(() => document.body.dataset.ready = '1')</script></body></html>`;

const args = process.argv.slice(2);
const browser = await chromium.launch();
try {
  if (args[0] === "--contact") {
    const [, out, ...files] = args;
    const items = files.map((f) => ({ src: dataUrl(readFileSync(f, "utf8")), name: basename(f, ".svg") }));
    const page = await browser.newPage({ viewport: { width: 1576, height: 200 } });
    await page.setContent(contactHtml(items));
    await page.waitForSelector("body[data-ready]");
    await page.screenshot({ path: out, fullPage: true });
    console.log("contact sheet:", out);
  } else {
    for (const f of args) {
      const svg = readFileSync(f, "utf8");
      const name = basename(f, ".svg");
      const page = await browser.newPage({ viewport: { width: 1312, height: 912 } });
      await page.setContent(sheetHtml(dataUrl(svg), name));
      await page.waitForSelector("body[data-ready]");
      const state = await page.evaluate(() => document.body.dataset.ready);
      const out = join(outDir, `${name}-sheet.png`);
      await page.screenshot({ path: out, fullPage: true });
      const warnings = lint(svg);
      if (state === "error") warnings.unshift("SVG FAILED TO RENDER (invalid markup)");
      console.log(`${name}: ${out}${warnings.length ? "\n  WARN " + warnings.join("\n  WARN ") : "  (lint ok)"}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
