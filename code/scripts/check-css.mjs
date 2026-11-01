// Fails on physical CSS properties (left/right) without an allow marker; use logical ones (inline/block/start/end).
// A deliberate physical value carries `physical: <reason>` in a comment on the same line or the line above.
// Existing sites are counted per package in .ratchet/<scope>.json (patterns.physicalCss) and may only shrink.
import { readFileSync } from "node:fs";
import { compareCounts, isSource, isTestFile, parseArgs, readBaseline, rel, report, runsAsMain, scopeOf, scopes, walk } from "./check-lib.mjs";

const cssProp = /(?:^|[\s;{])(?:(?:margin|padding|border)-(?:left|right)(?:-[a-z]+)?|border-(?:top|bottom)-(?:left|right)-radius|left|right|float|clear)\s*:|(?:text-align|float|clear)\s*:\s*(?:left|right)\b/;
const tsProp = /\b(?:margin|padding|border)(?:Left|Right)\w*\s*:|\bborder(?:Top|Bottom)(?:Left|Right)Radius\s*:|\b(?:textAlign|float|clear)\s*:\s*["'](?:left|right)["']/;
const marker = /physical:\s*\S/;

/** { scope: number of physical-property lines without a marker } */
export function countPhysical(root) {
  const counts = {};
  for (const file of walk(root)) {
    const r = rel(root, file);
    const isCss = r.endsWith(".css");
    if (!isCss && (!isSource(r) || isTestFile(r))) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!(isCss ? cssProp : tsProp).test(line) || marker.test(line) || marker.test(lines[i - 1] ?? "")) return;
      const scope = scopeOf(r) ?? ".";
      counts[scope] = (counts[scope] ?? 0) + 1;
    });
  }
  return counts;
}

if (runsAsMain(import.meta.url)) {
  const { root, rest } = parseArgs(process.argv.slice(2));
  const counts = countPhysical(root);
  const wanted = rest.length ? rest : [...Object.keys(scopes), "."];
  const problems = wanted.flatMap((s) => compareCounts(`physical CSS in ${s}`, { physicalCss: readBaseline(root, s).patterns?.physicalCss ?? 0 }, { physicalCss: counts[s] ?? 0 }));
  report("check-css", problems);
}
