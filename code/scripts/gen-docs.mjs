#!/usr/bin/env node
// Writes docs/MODULES.md (what each package and app area holds) and docs/LAYERS.md (the import rules and who is checked against them).
// `node scripts/gen-docs.mjs` writes both; `--check` writes nothing and fails when a file is stale, an import breaks a rule, or code/CLAUDE.md has more than 25 rules.
// Imports are found with a regex, so a computed import specifier is not seen (shortcut: no dependency on a parser; upgrade if such an import is ever added).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set(["node_modules", "dist", "out", "test-results", "playwright-report", ".cache", "fixtures", "gallery"]);
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
const isTest = (p) => /(\.test\.|\.spec\.|\/tests\/|\/testing\/|\/e2e\/|\.fixture\.)/.test(`/${p}`);

/** Purpose lines come from here, not from package.json, so the output does not depend on which package set a description. */
export const UNITS = {
  "packages/protocol": { purpose: "Wire types, frame codec, extension messages, settings schema, shared formatters.", may: [] },
  "packages/engine": { purpose: "TtsEngine interface, Kokoro (child process), Chatterbox (Python sidecar), fake engine, text normalization.", may: ["packages/protocol"] },
  "packages/player": { purpose: "Gapless streaming playback core, queue, sentence splitting; shared by the extension and the desktop reader.", may: ["packages/protocol"] },
  "packages/ui": { purpose: "Lumen components (React and vanilla), tokens, icons and logo data.", may: [] },
  "packages/server": { purpose: "Loopback HTTP server, token and Origin checks, /v1/* routes, standalone CLI.", may: ["packages/protocol", "packages/engine"] },
  "apps/extension": { purpose: "Chrome MV3 extension: content script, popup, options, side panel, service worker, offscreen player.", may: ["packages/protocol", "packages/player", "packages/ui"] },
  "apps/desktop": {
    purpose: "Electron app: main process, preload, renderer (library, reader, settings), shared contracts.",
    may: ["packages/protocol", "packages/engine", "packages/server", "packages/player", "packages/ui"],
  },
  e2e: { purpose: "Playwright suites, fixture pages and the visual harness.", may: "any" },
};

/** Path rules. `lint: true` means code/vite.config.ts enforces the same rule today; false means only this script does. */
export const PATH_RULES = [
  {
    id: "renderer-not-main",
    from: "apps/desktop/src/renderer/",
    denyTo: /^apps\/desktop\/src\/main\//,
    lint: true,
    text: "The renderer must not import from main/. Shared contracts go in src/shared/.",
  },
  { id: "main-not-renderer", from: "apps/desktop/src/main/", denyTo: /^apps\/desktop\/src\/renderer\//, lint: false, text: "Main must not import from the renderer." },
  { id: "app-uses-feature-index", from: "apps/extension/src/app/", denyTo: /^apps\/extension\/src\/features\/[^/]+\/.+/, lint: true, text: "Import a feature only through its index.ts." },
];

const unitOf = (rel) => Object.keys(UNITS).find((u) => rel === u || rel.startsWith(`${u}/`));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith("dist-")) walk(join(dir, e.name), out);
    } else if (/\.(ts|tsx|mts|css)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(join(dir, e.name));
  }
  return out;
}

/** Source files of every unit, relative to `root` with forward slashes. */
export function scan(root) {
  const files = [];
  for (const unit of Object.keys(UNITS)) {
    if (!existsSync(join(root, unit))) continue;
    for (const f of walk(join(root, unit))) files.push(relative(root, f).split("\\").join("/"));
  }
  return files.sort();
}

function importsOf(root, file) {
  if (file.endsWith(".css")) return [];
  const src = readFileSync(join(root, file), "utf8");
  return [...src.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2]);
}

/** Rule violations in non-test files: [{ file, spec, rule }]. */
export function violations(root, files) {
  const found = [];
  for (const file of files.filter((f) => !isTest(f) && !f.endsWith(".css"))) {
    const unit = unitOf(file);
    for (const spec of importsOf(root, file)) {
      const pkg = /^@speakkit\/([^/]+)/.exec(spec)?.[1];
      if (pkg) {
        const target = `packages/${pkg}`;
        const may = UNITS[unit].may;
        if (target !== unit && may !== "any" && !may.includes(target)) found.push({ file, spec, rule: `package-graph: ${unit} may not import ${target}` });
      } else if (spec.startsWith(".")) {
        const target = posix.normalize(posix.join(posix.dirname(file), spec));
        for (const r of PATH_RULES) if (file.startsWith(r.from) && r.denyTo.test(target)) found.push({ file, spec, rule: r.id });
      }
    }
  }
  return found;
}

const areaOf = (file) => {
  const parts = file.split("/");
  const src = parts.indexOf("src");
  if (src < 0) return null;
  const rest = parts.slice(src + 1);
  if (rest.length < 2) return rest.length ? "(src root)" : null;
  const expand = ["features", "app", "renderer", "main", "shared"].includes(rest[0]) && rest.length > 2;
  return expand ? `${rest[0]}/${rest[1]}` : rest[0];
};

function header(root, unit) {
  const p = join(root, unit, "src/index.ts");
  if (!existsSync(p)) return null;
  const m = /^\s*(\/\*\*?[\s\S]*?\*\/|(?:\/\/[^\n]*\n)+)/.exec(readFileSync(p, "utf8"));
  return m
    ? m[1]
        .replace(/^\/\*+|\*\/$/g, "")
        .replace(/^\s*(\*|\/\/) ?/gm, "")
        .trim()
    : null;
}

export function modulesDoc(root, files) {
  const lines = ["# Modules", "", "Generated by `node scripts/gen-docs.mjs` from the source tree. Do not edit by hand; CI runs `node scripts/gen-docs.mjs --check`. Test files are not counted.", ""];
  for (const [unit, info] of Object.entries(UNITS)) {
    const own = files.filter((f) => unitOf(f) === unit && !isTest(f) && !f.endsWith(".css"));
    const css = files.filter((f) => unitOf(f) === unit && f.endsWith(".css")).length;
    lines.push(
      `## ${unit}`,
      "",
      info.purpose,
      "",
      `May import: ${info.may === "any" ? "any workspace package" : info.may.length ? info.may.map((m) => `\`${m}\``).join(", ") : "no workspace package"}. Source files: ${own.length}, stylesheets: ${css}.`,
      "",
    );
    const h = header(root, unit);
    lines.push(h ? `Interface (\`src/index.ts\` header): ${h.split("\n").join(" ")}` : "Interface: `src/index.ts` has no header yet (refactor plan G13).", "");
    const areas = new Map();
    for (const f of own) {
      const a = areaOf(f);
      if (a) areas.set(a, { n: (areas.get(a)?.n ?? 0) + 1, index: (areas.get(a)?.index ?? false) || f.endsWith("/index.ts") });
    }
    if (areas.size) {
      lines.push("| Area under `src/` | Files | `index.ts` |", "|---|---|---|");
      for (const [a, v] of [...areas].sort(([x], [y]) => x.localeCompare(y))) lines.push(`| \`${a}\` | ${v.n} | ${v.index ? "yes" : "no"} |`);
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function layersDoc() {
  const lines = [
    "# Layers",
    "",
    "Generated by `node scripts/gen-docs.mjs` from the rule list in that file. Do not edit by hand. A rule marked `lint` is also enforced by `code/vite.config.ts`; the others are checked by `gen-docs.mjs --check` only, until the lint config is extended (refactor plan WP-1, WP-15).",
    "",
    "## Package graph (deny by default)",
    "",
    "A unit may import only the workspace packages listed; every other `@speakkit/*` import is a violation.",
    "",
    "| Unit | May import |",
    "|---|---|",
  ];
  for (const [unit, info] of Object.entries(UNITS))
    lines.push(`| \`${unit}\` | ${info.may === "any" ? "any (tests and fixtures)" : info.may.length ? info.may.map((m) => `\`${m}\``).join(", ") : "none"} |`);
  lines.push("", "## Path rules", "", "| Id | Applies to files under | Rule | `lint` |", "|---|---|---|---|");
  for (const r of PATH_RULES) lines.push(`| \`${r.id}\` | \`${r.from}\` | ${r.text} | ${r.lint ? "yes" : "no"} |`);
  lines.push(
    "",
    "## Planned",
    "",
    "- A feature is imported by another feature or by the desktop renderer only through its `index.ts` (work package 15; today `apps/extension/src/features/reader/view.ts` and `apps/desktop/src/renderer/features/reader/*` deep-import).",
    "- `electron` value imports only under `apps/desktop/src/main` and `preload`; no Node built-ins in renderer, extension or UI packages (work package 1).",
    "",
  );
  return lines.join("\n");
}

/** Number of numbered rules under "## Rules" in CLAUDE.md. */
export const claudeRuleCount = (text) => (text.split(/^## Rules$/m)[1] ?? "").split("\n").filter((l) => /^\d+\. /.test(l)).length;

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const docs = join(root, "..", "docs");
  const files = scan(root);
  const outputs = { "MODULES.md": modulesDoc(root, files), "LAYERS.md": layersDoc() };
  if (!process.argv.includes("--check")) {
    for (const [name, text] of Object.entries(outputs)) writeFileSync(join(docs, name), text);
    return;
  }
  const problems = violations(root, files).map((v) => `${v.file} imports "${v.spec}": ${v.rule}`);
  for (const [name, text] of Object.entries(outputs)) {
    const p = join(docs, name);
    if (!existsSync(p) || readFileSync(p, "utf8").replace(/\r\n/g, "\n") !== text) problems.push(`docs/${name} is stale: run node scripts/gen-docs.mjs`);
  }
  const rules = claudeRuleCount(readFileSync(join(root, "CLAUDE.md"), "utf8"));
  if (rules > 25) problems.push(`code/CLAUDE.md has ${rules} rules; the limit is 25`);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
