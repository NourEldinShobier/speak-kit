import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite-plus";

const here = dirname(fileURLToPath(import.meta.url));
const ui = resolve(here, "../../../packages/ui/src");

/** Sections of lumen.css (the `/* ---------- name ... ---------- *\/` markers) the in-page UI uses. Everything else stays out of content.js. */
export const CONTENT_SECTIONS = [
  "tokens",
  "icons",
  "focus ring",
  "disabled",
  "button",
  "text input",
  "toggle",
  "kbd, avatar, favicon",
  "menu",
  "segmented",
  "toast / banner / tooltip",
  "loading",
  "slider",
  "modal / popover",
  "brand mark",
  "reduced motion",
];

/** Splits lumen.css by section marker and keeps `names`; strips comments and collapses whitespace. */
export function lumenSubset(css: string, names: string[] = CONTENT_SECTIONS): string {
  const parts = css.split(/(?=\/\* ---------- )/);
  const keep = parts.filter((p) => {
    const m = /^\/\* ---------- ([^\n]*?) ?(?:[.(:]|---------- \*\/)/.exec(p) ?? /^\/\* ---------- ([^\n]*?) ----------/.exec(p);
    const title = (m?.[1] ?? "").toLowerCase();
    return names.some((n) => title.startsWith(n.toLowerCase()));
  });
  return minifyCss(keep.join("\n"));
}

export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{};:,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

/** Icon names found as quoted strings in the given sources and present in the kit's icon table. */
export function usedIcons(sources: string[], all: string[]): Set<string> {
  const set = new Set<string>();
  const known = new Set(all);
  for (const src of sources) for (const m of src.matchAll(/["'`]([a-z][a-z0-9-]*)["'`]/g)) if (known.has(m[1]!)) set.add(m[1]!);
  return set;
}

/**
 * Content-script build helper: `virtual:lumen-content-css` is the subset of lumen.css the in-page UI needs, and
 * `icon-data.ts` is cut to the icons that are referenced from the extension and the kit's vanilla builders.
 */
export function contentAssets(srcFiles: () => string[]): Plugin {
  return {
    name: "speakkit-content-assets",
    enforce: "pre",
    resolveId(id) {
      if (id === "virtual:lumen-content-css") return "\0lumen-content-css";
      return undefined;
    },
    load(id) {
      if (id === "\0lumen-content-css") {
        const css = lumenSubset(readFileSync(resolve(ui, "lumen.css"), "utf8"));
        return `export default ${JSON.stringify(css)};`;
      }
      return undefined;
    },
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("packages/ui/src/icon-data.ts")) return undefined;
      const names = [...code.matchAll(/^ {2}"([a-z0-9-]+)":/gm)].map((m) => m[1]!);
      const sources = [...srcFiles(), resolve(ui, "vanilla.ts"), ...listSources(resolve(ui, "react"))].map((f) => readFileSync(f, "utf8"));
      const used = usedIcons(sources, names);
      const kept = code
        .split("\n")
        .filter((line) => {
          const m = /^ {2}"([a-z0-9-]+)":/.exec(line);
          return !m || used.has(m[1]!);
        })
        .join("\n");
      return { code: kept, map: null };
    },
  };
}

/** Non-test .ts/.tsx files below `dir`. */
export function listSources(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = resolve(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}
