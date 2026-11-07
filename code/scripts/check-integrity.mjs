// Guards against gaming the gates:
//  1. no new skipped/focused tests or @ts-nocheck (counts per package live in .ratchet/<scope>.json under patterns);
//  2. no ratchet baseline above the committed one on the base branch (origin/main), so baselines only go down;
//  3. the numeric budgets in the budget tests do not exceed the committed contract table .ratchet/budgets.json.
// Test hooks: --root <dir>, --base <dir> (directory of base-branch baselines instead of git).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compareCounts, flatten, isSource, isTestFile, parseArgs, readBaseline, readJson, rel, report, runsAsMain, scopeOf, scopes, walk } from "./check-lib.mjs";

const skipped = /\b(?:it|test|describe|suite)\.(?:skip|todo|fixme)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(|\bit\.fails\s*\(|\.skipIf\s*\(/g;
// Opt-in GPU tests (`describe.runIf(env)`) are counted apart from skips: they run only where the env var is set.
const gated = /\.runIf\s*\(/g;
const focused = /\b(?:it|test|describe|suite)\.only\s*\(|\b(?:fit|fdescribe)\s*\(/g;
const noCheck = /@ts-nocheck/g;

/** { scope: { skipped, focused, tsNocheck } } over every source file, tests included. */
export function countIntegrity(root) {
  const out = {};
  for (const file of walk(root)) {
    const r = rel(root, file);
    const scope = scopeOf(r);
    if (!scope || !isSource(r)) continue;
    const text = readFileSync(file, "utf8");
    const b = (out[scope] ??= { skipped: 0, focused: 0, gated: 0, tsNocheck: 0 });
    if (isTestFile(r)) {
      b.skipped += [...text.matchAll(skipped)].length;
      b.focused += [...text.matchAll(focused)].length;
      b.gated += [...text.matchAll(gated)].length;
    }
    b.tsNocheck += [...text.matchAll(noCheck)].length;
  }
  return out;
}

// Budget numbers in the three budget tests plus the extension bundle table, keyed by what they bound.
const budgetFiles = [
  "apps/extension/scripts/sizes.mjs",
  "apps/extension/src/budget.test.ts",
  "apps/desktop/tests/perf.test.ts",
  "e2e/tests/perf.spec.ts",
  "e2e/tests/selection.spec.ts",
  "packages/server/tests/real-chatterbox.test.ts",
];

export function readBudgets(root) {
  const out = {};
  for (const f of budgetFiles) {
    const file = path.join(root, f);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const consts = Object.fromEntries([...text.matchAll(/^const (\w+) = (\d+);/gm)].map((m) => [m[1], Number(m[2])]));
    const seen = {};
    const put = (name, value) => {
      seen[name] = (seen[name] ?? 0) + 1;
      out[`${f}#${name}${seen[name] > 1 ? `#${seen[name]}` : ""}`] = value;
    };
    const table = text.match(/BUDGET_KB = \{([\s\S]*?)\n\};/);
    if (table) for (const m of table[1].matchAll(/^\s*"?([\w.-]+)"?:\s*(\d+)/gm)) put(m[1], Number(m[2]));
    const css = text.match(/CSS_BUDGET_KB = (\d+)/);
    if (css) put("CSS_BUDGET_KB", Number(css[1]));
    for (const m of text.matchAll(/expect\(([^,)]*)[^)]*\)\.toBeLessThan(?:OrEqual)?\(([^)]+)\)/g)) {
      const expr = m[2].trim();
      const value = /^\d+(\s*\*\s*\d+)*$/.test(expr) ? expr.split("*").reduce((a, n) => a * Number(n), 1) : consts[expr];
      if (value === undefined) throw new Error(`${f}: cannot read budget ${expr}`);
      put(m[1].trim(), value);
    }
  }
  return out;
}

function baseBaselines(root, baseDir) {
  const out = {};
  for (const s of Object.keys(scopes)) {
    let text;
    if (baseDir) {
      const p = path.join(baseDir, `${s}.json`);
      text = existsSync(p) ? readFileSync(p, "utf8") : undefined;
    } else {
      const prefix = spawnSync("git", ["rev-parse", "--show-prefix"], { cwd: root, encoding: "utf8" }).stdout?.trim();
      const r = spawnSync("git", ["show", `origin/main:${prefix}.ratchet/${s}.json`], { cwd: root, encoding: "utf8" });
      text = r.status === 0 ? r.stdout : undefined;
    }
    if (text) out[s] = JSON.parse(text);
  }
  return out;
}

if (runsAsMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const writeBudgets = argv.includes("--write-budgets");
  const bi = argv.indexOf("--base");
  const baseDir = bi >= 0 ? path.resolve(argv.splice(bi, 2)[1]) : undefined;
  const { root } = parseArgs(argv.filter((a) => a !== "--write-budgets"));
  const problems = [];

  const counts = countIntegrity(root);
  for (const s of Object.keys(scopes)) {
    const was = readBaseline(root, s).patterns ?? {};
    problems.push(...compareCounts(`${s} test integrity`, { skipped: was.skipped, focused: was.focused, gated: was.gated, tsNocheck: was.tsNocheck }, counts[s] ?? {}));
  }

  for (const [s, base] of Object.entries(baseBaselines(root, baseDir))) {
    const now = flatten(readBaseline(root, s));
    for (const [k, v] of Object.entries(flatten(base))) if ((now[k] ?? 0) > v) problems.push(`${s} baseline ${k} grew from ${v} to ${now[k]}; baselines only go down`);
  }

  const tablePath = path.join(root, ".ratchet", "budgets.json");
  if (writeBudgets) {
    const actual = readBudgets(root);
    const old = existsSync(tablePath) ? readJson(tablePath) : {};
    const raised = Object.keys(actual).filter((k) => actual[k] > (old[k] ?? Infinity));
    if (raised.length)
      report(
        "check-integrity --write-budgets",
        raised.map((k) => `budget ${k} would rise to ${actual[k]}`),
      );
    mkdirSync(path.dirname(tablePath), { recursive: true });
    writeFileSync(
      tablePath,
      `${JSON.stringify(actual, null, 2)}
`,
    );
    process.exit(0);
  }
  if (existsSync(tablePath)) {
    const table = readJson(tablePath);
    const actual = readBudgets(root);
    for (const k of new Set([...Object.keys(table), ...Object.keys(actual)])) {
      if (!(k in table)) problems.push(`budget ${k} = ${actual[k]} is not in .ratchet/budgets.json`);
      else if (!(k in actual)) problems.push(`budget ${k} is in .ratchet/budgets.json but no longer in the code`);
      else if (actual[k] > table[k]) problems.push(`budget ${k} raised to ${actual[k]} (contract ${table[k]})`);
      else if (actual[k] < table[k]) problems.push(`budget ${k} is ${actual[k]}; lower the contract table from ${table[k]}`);
    }
  }
  if (existsSync(path.join(root, ".ratchet", "budgets.json")) === false && !baseDir) problems.push(".ratchet/budgets.json is missing");
  report("check-integrity", problems);
}
