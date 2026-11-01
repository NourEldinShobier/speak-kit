// Prints the size of the shipped bundles (raw and gzip) and how much of content.js is inlined CSS and icon data.
// Usage: node scripts/size-report.mjs [dist]   (build first: pnpm exec vp build)
import { readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = process.argv[2] ?? "dist";
const kb = (n) => (n / 1024).toFixed(1);
const size = (file) => {
  const buf = readFileSync(file);
  return { raw: buf.length, gz: gzipSync(buf, { level: 9 }).length };
};

const c = readFileSync(join(dist, "content.js"), "utf8");
let strings = 0;
for (const m of c.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
  const l = (m[1] ?? m[2]).length;
  if (l > 800) strings += l;
}
const cs = size(join(dist, "content.js"));
console.log(`content.js     ${kb(cs.raw)} KB raw, ${kb(cs.gz)} KB gzip   (budget 70 / 24)   css+long strings ${kb(strings)} KB`);

const ui = size(join(dist, "content-ui.js"));
console.log(`content-ui.js  ${kb(ui.raw)} KB raw, ${kb(ui.gz)} KB gzip   (loaded when the first control is shown; Lumen kit builders, CSS, icons, launcher, dock, reader)`);

const assets = join(dist, "assets");
const popupJs = readdirSync(assets).filter((f) => f.endsWith(".js") && !f.startsWith("soundtouch-processor"));
// popup = its entry chunk plus the chunks it imports (static graph)
const seen = new Set();
const walk = (f) => {
  if (seen.has(f)) return;
  seen.add(f);
  const src = readFileSync(join(assets, f), "utf8");
  for (const m of src.matchAll(/from\s*"\.\/([^"]+\.js)"|import\s*"\.\/([^"]+\.js)"/g)) walk(m[1] ?? m[2]);
};
const entry = (name) => popupJs.find((f) => f.startsWith(name + "-"));
for (const name of ["popup", "options", "sidepanel", "offscreen"]) {
  seen.clear();
  const e = entry(name);
  if (!e) continue;
  walk(e);
  let raw = 0, gz = 0;
  for (const f of seen) {
    const s = size(join(assets, f));
    raw += s.raw;
    gz += s.gz;
  }
  console.log(`${name.padEnd(14)} ${kb(raw)} KB raw, ${kb(gz)} KB gzip   (${[...seen].length} chunks)${name === "popup" ? "   (budget 120 KB gzip)" : ""}`);
}
const bg = size(join(dist, "background.js"));
console.log(`background.js  ${kb(bg.raw)} KB raw, ${kb(bg.gz)} KB gzip`);
const st = size(join(assets, readdirSync(assets).find((f) => f.startsWith("soundtouch-processor"))));
console.log(`soundtouch worklet ${kb(st.raw)} KB raw, ${kb(st.gz)} KB gzip (loaded only above 2x)`);
