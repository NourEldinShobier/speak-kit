// Shared helpers for the check-*.mjs gates: file walking, scope and file classification, baseline files.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// One baseline file per package: code/.ratchet/<scope>.json.
export const scopes = {
  desktop: "apps/desktop",
  extension: "apps/extension",
  ui: "packages/ui",
  player: "packages/player",
  server: "packages/server",
  engine: "packages/engine",
  protocol: "packages/protocol",
  e2e: "e2e",
};

const skipDirs = new Set(["node_modules", "dist", "out", "release", "build", ".git", "test-results", "coverage", "canary", ".ratchet"]);

export const rel = (root, file) => path.relative(root, file).split(path.sep).join("/");

export function walk(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name) || name.startsWith("dist-")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.push(full);
  }
  return out;
}

export const isTestFile = (f) => /(\.test\.|\.spec\.)|(^|\/)(tests?|testing|bench|e2e|fixtures|gallery)\//.test(f);
export const isScriptFile = (f) => /(^|\/)scripts\/|(^|\/)cli\.[tj]s$/.test(f);
export const isSource = (f) => /\.(ts|tsx|mjs|js)$/.test(f) && !f.endsWith(".d.ts");
// Runtime code: shipped source, not tests, build scripts or the CLI.
export const isRuntime = (f) => isSource(f) && !isTestFile(f) && !isScriptFile(f);

export const scopeOf = (f) => Object.keys(scopes).find((s) => f === scopes[s] || f.startsWith(`${scopes[s]}/`));

export const baselinePath = (root, scope) => path.join(root, ".ratchet", `${scope}.json`);
export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export const readBaseline = (root, scope) => (existsSync(baselinePath(root, scope)) ? readJson(baselinePath(root, scope)) : {});

// "--root <dir>" points a gate at a canary fixture instead of the real tree.
export function parseArgs(argv) {
  const args = { root: codeRoot, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") args.root = path.resolve(argv[++i]);
    else args.rest.push(argv[i]);
  }
  return args;
}

export function report(name, problems) {
  if (problems.length) {
    console.error(`${name}: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${name}: ok`);
}

// Counts may only shrink: more than the baseline is a regression, fewer means the baseline has to be lowered in the same change.
export function compareCounts(label, baseline, actual) {
  const problems = [];
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(actual)])) {
    const was = baseline[key] ?? 0;
    const now = actual[key] ?? 0;
    if (now > was) problems.push(`${label} ${key}: ${now} > baseline ${was}`);
    else if (now < was) problems.push(`${label} ${key}: baseline ${was} is higher than the real count ${now}; lower it in .ratchet`);
  }
  return problems;
}

export const runsAsMain = (metaUrl) => process.argv[1] && pathToFileURL(process.argv[1]).href === metaUrl;

// The same shrink-only rule applied to nested { group: { name: count } } baselines.
export function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v && typeof v === "object") Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
