// Large review grid: each mark on ink and paper at 360 px, its tile at 180 px, plus 32 and 16 px.
// Usage: node preview.mjs out.png a.svg b.svg ...   (tiles are picked up as <name>-tile.svg next to each mark)
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL("D:/workspaces/speak-it/code/e2e/node_modules/@playwright/test/index.mjs").href);
const [out, ...files] = process.argv.slice(2);
const url = (f) => `data:image/svg+xml;base64,${Buffer.from(readFileSync(f)).toString("base64")}`;
const cells = files.map((f) => {
  const tile = f.replace(/\.svg$/, "-tile.svg"), src = url(f), t = existsSync(tile) ? url(tile) : src;
  return `<div style="display:flex;gap:8px;align-items:center;background:#1c1d20;padding:8px">
  <div style="background:#0B0C0E;width:360px;height:360px;display:grid;place-items:center"><img src="${src}" width="340"></div>
  <div style="background:#F4F4F2;width:360px;height:360px;display:grid;place-items:center"><img src="${src}" width="340"></div>
  <div style="display:grid;gap:10px;justify-items:center;color:#aaa;font:600 13px system-ui"><img src="${t}" width="180">
  <div style="display:flex;gap:12px;align-items:center"><img src="${t}" width="32"><img src="${t}" width="16"><img src="${src}" width="32" style="background:#F4F4F2"></div>${basename(f, ".svg")}</div></div>`;
}).join("");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 940, height: 300 } });
await p.setContent(`<body style="margin:0;background:#111;display:grid;gap:6px">${cells}</body>`);
await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log(out);
