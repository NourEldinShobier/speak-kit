// Shrink-only ratchet: lint rule violations (limits from docs/engineering/ostio-practices.md) and risky patterns per package,
// compared with .ratchet/<scope>.json. More than the baseline fails; a baseline above the real count fails too (lower it).
//   node scripts/check-ratchet.mjs [scope ...]          check (default: every package)
//   node scripts/check-ratchet.mjs --write [scope ...]   rewrite baselines, refusing to raise any number
// Test hooks: --root <dir> (tree to scan) and --lint-json <file> (diagnostics instead of running vp lint).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { countPhysical } from "./check-css.mjs";
import { countIntegrity } from "./check-integrity.mjs";
import { baselinePath, codeRoot, compareCounts, flatten, isSource, isTestFile, parseArgs, readBaseline, readJson, rel, report, runsAsMain, scopeOf, scopes, walk } from "./check-lib.mjs";

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"'`\\])\/\/.*$/gm, "$1");
const count = (text, re) => [...text.matchAll(re)].length;

// Counted on non-test source after comments are removed, except where noted.
const stripped = {
  asAny: /\bas any\b/g,
  asUnknownAs: /\bas unknown as\b/g,
  tsDirective: /@ts-(?:ignore|expect-error)/g,
  atomicsWait: /\bAtomics\.wait\b/g,
  sendSync: /\.sendSync\s*\(/g,
  shortInterval: /\bsetInterval\s*\([^;]{0,300}?,\s*\d{1,3}\s*\)/g,
};
// Counted on the raw text: the disable comment itself, and a catch whose body is empty (a comment in it records the reason).
const raw = {
  oxlintDisable: /\boxlint-disable/g,
  swallowingCatch: /catch\s*(?:\([^)]*\))?\s*\{\s*\}|\.catch\(\s*\(\s*\w*\s*\)\s*=>\s*(?:\{\s*\}|undefined|null|void 0)\s*\)/g,
};

export function countPatterns(root) {
  const out = {};
  for (const file of walk(root)) {
    const r = rel(root, file);
    const scope = scopeOf(r);
    if (!scope || !isSource(r) || isTestFile(r)) continue;
    const text = readFileSync(file, "utf8");
    const noComments = strip(text);
    const bucket = (out[scope] ??= {});
    for (const [k, re] of Object.entries(stripped)) bucket[k] = (bucket[k] ?? 0) + count(noComments, re);
    for (const [k, re] of Object.entries(raw)) bucket[k] = (bucket[k] ?? 0) + count(text, re);
  }
  return out;
}

export function countLint(diagnostics) {
  const out = {};
  for (const d of diagnostics) {
    const f = d.filename.replaceAll("\\", "/");
    const scope = scopeOf(f);
    if (!scope) continue;
    const rule = d.code.replace(/^.*\(/, "").replace(/\)$/, "");
    const bucket = ((out[scope] ??= {})[isTestFile(f) ? "tests" : "code"] ??= {});
    bucket[rule] = (bucket[rule] ?? 0) + 1;
  }
  return out;
}

function lintDiagnostics(lintJson) {
  if (lintJson) return readJson(lintJson).diagnostics;
  const r = spawnSync("pnpm", ["exec", "vp", "lint", "-f", "json"], { cwd: codeRoot, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, shell: process.platform === "win32" });
  try {
    return JSON.parse(r.stdout).diagnostics;
  } catch {
    console.error(r.stdout.slice(0, 2000), r.stderr.slice(0, 2000));
    process.exit(1);
  }
}

if (runsAsMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const write = argv.includes("--write");
  const li = argv.indexOf("--lint-json");
  const lintJson = li >= 0 ? path.resolve(argv.splice(li, 2)[1]) : undefined;
  const { root, rest } = parseArgs(argv.filter((a) => a !== "--write"));
  const wanted = rest.length ? rest : Object.keys(scopes);
  const unknown = wanted.filter((s) => !(s in scopes));
  if (unknown.length) report("check-ratchet", [`unknown scope ${unknown.join(", ")}; use ${Object.keys(scopes).join(", ")}`]);

  const lint = countLint(lintDiagnostics(lintJson));
  const patterns = countPatterns(root);
  const css = countPhysical(root);
  const integrity = countIntegrity(root);
  const problems = [];
  for (const s of wanted) {
    const actual = { lint: lint[s] ?? { code: {}, tests: {} }, patterns: { ...(patterns[s] ?? {}), physicalCss: css[s] ?? 0, ...(integrity[s] ?? {}) } };
    actual.lint.code ??= {};
    actual.lint.tests ??= {};
    const base = readBaseline(root, s);
    const was = { lint: flatten(base.lint), patterns: flatten(base.patterns) };
    const now = { lint: flatten(actual.lint), patterns: flatten(actual.patterns) };
    if (write) {
      const raised = Object.entries({ ...now.lint, ...now.patterns }).filter(([k, v]) => v > (was.lint[k] ?? was.patterns[k] ?? Infinity)).map(([k, v]) => `${s} ${k}: ${v} > baseline`);
      if (raised.length) problems.push(...raised);
      else {
        mkdirSync(path.dirname(baselinePath(root, s)), { recursive: true });
        writeFileSync(baselinePath(root, s), `${JSON.stringify({ lint: actual.lint, patterns: actual.patterns }, null, 2)}\n`);
      }
    } else {
      problems.push(...compareCounts(`${s} lint`, was.lint, now.lint), ...compareCounts(`${s} patterns`, was.patterns, now.patterns));
    }
  }
  report(write ? "check-ratchet --write" : "check-ratchet", problems);
}
