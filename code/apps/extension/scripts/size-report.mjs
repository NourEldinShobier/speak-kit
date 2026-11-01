// Prints the gzip size of every shipped bundle against its budget (scripts/sizes.mjs), and how much of content.js is inlined CSS and icon data.
// Usage: node scripts/size-report.mjs [dist]   (build first: pnpm exec vp build)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET_KB, CSS_BUDGET_KB, measure, overBudget } from "./sizes.mjs";

const dist = process.argv[2] ?? "dist";
const sizes = measure(dist);
for (const [name, bytes] of Object.entries(sizes)) {
  const limit = name.endsWith(".css") ? CSS_BUDGET_KB : BUDGET_KB[name];
  console.log(`${name.padEnd(20)} ${(bytes / 1024).toFixed(1).padStart(6)} KB gzip${limit ? `   (budget ${limit})` : ""}`);
}
let strings = 0;
for (const m of readFileSync(join(dist, "content.js"), "utf8").matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
  const l = (m[1] ?? m[2]).length;
  if (l > 800) strings += l;
}
console.log(`content.js: css and long strings ${(strings / 1024).toFixed(1)} KB raw`);
const over = overBudget(sizes);
if (over.length) {
  console.error(`over budget:\n  ${over.join("\n  ")}`);
  process.exitCode = 1;
}
