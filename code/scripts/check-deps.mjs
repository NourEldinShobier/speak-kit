// Dependency policy: exact versions through the pnpm catalog, a 7-day release age, no unpinned tool runs,
// and every direct dependency named in a decision record under docs/decisions.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, readJson, report } from "./check-lib.mjs";

const exact = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$|^npm:.+@\d+\.\d+\.\d+(?:-[\w.-]+)?$/;
const { root } = parseArgs(process.argv.slice(2));
const problems = [];

const manifests = ["package.json"];
for (const group of ["apps", "packages", "tools"]) {
  const dir = path.join(root, group);
  if (existsSync(dir)) for (const d of readdirSync(dir)) if (existsSync(path.join(dir, d, "package.json"))) manifests.push(`${group}/${d}/package.json`);
}
if (existsSync(path.join(root, "e2e/package.json"))) manifests.push("e2e/package.json");

const workspaceYaml = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8").replace(/\r/g, "");
const age = workspaceYaml.match(/^minimumReleaseAge:\s*(\d+)/m);
if (!age || Number(age[1]) < 10080) problems.push("pnpm-workspace.yaml: minimumReleaseAge must be at least 10080 (7 days, in minutes)");

const catalog = {};
const block = workspaceYaml.match(/^catalog:\n((?:[ \t]+.*\n?)*)/m);
for (const line of block?.[1].split("\n") ?? []) {
  const m = line.match(/^\s+"?([^":]+)"?:\s*"?([^"\s]+)"?\s*$/);
  if (m) catalog[m[1]] = m[2];
}
for (const [name, spec] of Object.entries(catalog)) if (!exact.test(spec)) problems.push(`catalog ${name}: "${spec}" is not an exact version`);

const rootPkg = readJson(path.join(root, "package.json"));
if (!rootPkg.packageManager) problems.push("package.json: packageManager is not pinned");
for (const [name, cmd] of Object.entries(rootPkg.scripts ?? {}))
  if (/\bdlx\b|\bnpx\b/.test(cmd)) problems.push(`package.json script ${name}: runs an unpinned tool (${cmd}); add it as a dev dependency`);

const adrDir = existsSync(path.join(root, "docs/decisions")) ? path.join(root, "docs/decisions") : path.join(root, "..", "docs", "decisions");
const adr = existsSync(adrDir)
  ? readdirSync(adrDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => readFileSync(path.join(adrDir, f), "utf8"))
      .join("\n")
  : "";
// Whole tokens only: "react" is not found inside "react-dom".
const tokens = new Set((adr.match(/@?\w[\w./-]*/g) ?? []).map((t) => t.replace(/[./-]+$/, "")));

const direct = new Set();
function checkSpec(file, name, spec) {
  if (spec.startsWith("workspace:")) return;
  if (spec === "catalog:") {
    if (!(name in catalog)) problems.push(`${file}: ${name} uses catalog: but is not in the catalog`);
  } else if (!exact.test(spec)) {
    problems.push(`${file}: ${name} "${spec}" is not an exact version; use the catalog`);
  }
  direct.add(name);
}
for (const m of manifests) {
  const pkg = readJson(path.join(root, m));
  for (const k of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, spec] of Object.entries(pkg[k] ?? {})) checkSpec(m, name, spec);
  }
}
for (const name of [...direct].sort()) if (!tokens.has(name)) problems.push(`${name} is not named in docs/decisions/*.md`);
report("check-deps", problems);
