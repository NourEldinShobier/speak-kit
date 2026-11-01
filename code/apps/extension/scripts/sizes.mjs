// Real gzip sizes of a built extension (dist folder), shared by scripts/size-report.mjs and src/budget.test.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;

/** Budgets in KB of gzip. Pages count their JS and CSS as the HTML loads them (script + modulepreload), not chunks loaded later on demand. */
export const BUDGET_KB = {
  popup: 120,
  options: 120,
  sidepanel: 100,
  offscreen: 14,
  background: 8,
  "content.js": 16,
  "content-ui.js": 30,
  "soundtouch-worklet": 20,
};
/** CSS the pages load, per page. */
export const CSS_BUDGET_KB = 12;

/** Files an extension page loads at start: its module scripts and preloads (JS), and stylesheets (CSS). */
export function pageAssets(dist, page) {
  const html = readFileSync(join(dist, `${page}.html`), "utf8");
  const refs = (re) => [...html.matchAll(re)].map((m) => m[1].replace(/^\.\//, ""));
  const js = new Set([...refs(/<script[^>]+src="([^"]+)"/g), ...refs(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)]);
  return { js: [...js], css: refs(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g) };
}

/** { name: { gz, raw? } } in bytes for every budgeted bundle. */
export function measure(dist) {
  const out = {};
  for (const page of ["popup", "options", "sidepanel", "offscreen"]) {
    const a = pageAssets(dist, page);
    out[page] = a.js.reduce((n, f) => n + gz(join(dist, f)), 0);
    out[`${page}.css`] = a.css.reduce((n, f) => n + gz(join(dist, f)), 0);
  }
  for (const f of ["background.js", "content.js", "content-ui.js"]) out[f === "background.js" ? "background" : f] = gz(join(dist, f));
  const worklet = readdirSync(join(dist, "assets")).find((f) => f.startsWith("soundtouch-processor"));
  out["soundtouch-worklet"] = worklet ? gz(join(dist, "assets", worklet)) : 0;
  return out;
}

/** Entries over budget as "name: 12.3 KB > 10 KB". */
export function overBudget(sizes) {
  return Object.entries(sizes).flatMap(([name, bytes]) => {
    const limit = name.endsWith(".css") ? CSS_BUDGET_KB : BUDGET_KB[name];
    return limit !== undefined && bytes > limit * 1024 ? [`${name}: ${(bytes / 1024).toFixed(1)} KB > ${limit} KB`] : [];
  });
}
