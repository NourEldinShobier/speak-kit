import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { CSS_FILE, TOKENS_FILE, renderTokens } from "../scripts/gen-tokens.ts";
import { nativeTokens, tokens } from "../src/tokens";

const codeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCANNED = ["packages/ui/src", "packages/ui/gallery", "apps/extension/src"];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = resolve(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(css|tsx?)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
const sources = SCANNED.flatMap((d) => files(resolve(codeRoot, d))).map((p) => ({ path: relative(codeRoot, p).replaceAll("\\", "/"), text: readFileSync(p, "utf8") }));

describe("tokens module", () => {
  test("src/tokens.ts is what gen-tokens produces from lumen.css (run gen:tokens when this fails)", () => {
    expect(readFileSync(TOKENS_FILE, "utf8")).toBe(renderTokens(readFileSync(CSS_FILE, "utf8")));
  });

  test("carries the Lockix light values of lumen.css", () => {
    expect(tokens.light["surface-window"]).toBe("#f0f0f0");
    expect(tokens.light["surface-card"]).toBe("#ffffff");
    expect(tokens.light["cta"]).toBe("#201e25");
    expect(tokens.light["accent-default"]).toBe("#0069cc");
    expect(tokens.light["stroke-control"]).toBe("#e5e5e5");
    expect(tokens.light["stroke-field"]).toBe("#c3c6cc");
    expect(tokens.light["text-primary"]).toBe("#1b2230");
    expect(tokens.light["text-on-highlight"]).toBe("#1e1f20");
    expect(tokens.light["chip-red"]).toBe("#ffe4e5");
    expect(tokens.light["disabled-thumb"]).toBe("#c9ccd2");
    expect(tokens.light["track"]).toBe("#ececec");
    expect(tokens.light["kbd-fill"]).toBe("#ececec");
    expect(tokens.light["kbd-fill-on-cta"]).toBe("#3a3841");
    expect(tokens.light["destructive-fill-hover"]).toBe("#fef2f2");
    expect(tokens.light["destructive-ring-hover"]).toBe("#f2b8b8");
    expect(tokens.light["destructive-fill-pressed"]).toBe("#fde4e4");
  });

  test("native tokens are picked from the same table", () => {
    expect(nativeTokens.light).toEqual({ surfaceWindow: "#f0f0f0", surfaceCard: "#ffffff", textPrimary: "#1b2230" });
  });
});

describe("custom properties", () => {
  test("every var(--name) used in the UI kit and the extension is defined somewhere", () => {
    const defined = new Set<string>();
    for (const { text } of sources) for (const m of text.matchAll(/(?<![\w(])--([\w-]+)["']?\s*:/g)) defined.add(m[1]!);
    const missing: string[] = [];
    for (const { path, text } of sources) for (const m of text.matchAll(/var\(--([\w-]+)\s*(,?)/g)) if (!defined.has(m[1]!) && !m[2]) missing.push(`${path}: --${m[1]}`);
    expect(missing).toEqual([]);
  });
});

/** Files allowed to carry hex colours: the token table itself, the logo colours (fixed brand art, not themed), and the highlight swatches painted on host pages that have no Lumen tokens. */
const HEX_ALLOWED = new Set([
  "packages/ui/src/lumen.css",
  "packages/ui/src/tokens.ts",
  "packages/ui/src/logo-data.ts",
  "apps/extension/src/features/highlight/colors.ts",
  "apps/extension/src/testing/fixtures.ts",
]);

describe("hard-coded colours", () => {
  test("components, styles and gallery use tokens, not hex values", () => {
    const hits = sources.filter((s) => !HEX_ALLOWED.has(s.path)).flatMap((s) => [...s.text.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)].map((m) => `${s.path}: ${m[0]}`));
    expect(hits).toEqual([]);
  });
});
