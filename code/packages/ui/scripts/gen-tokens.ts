// Generates src/tokens.ts from the token blocks of src/lumen.css (the single source). Run: node scripts/gen-tokens.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CSS_FILE = join(here, "../src/lumen.css");
export const TOKENS_FILE = join(here, "../src/tokens.ts");

type Table = Record<string, string>;
const block = (css: string, selector: string): Table => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`lumen.css has no ${selector} block`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
};

/** The generated source of src/tokens.ts for a lumen.css text. */
export function renderTokens(css: string): string {
  const light = block(css, ":root,\n:host");
  const native = (t: Table) => `{ surfaceWindow: ${JSON.stringify(t["surface-window"]!)}, surfaceCard: ${JSON.stringify(t["surface-card"]!)}, textPrimary: ${JSON.stringify(t["text-primary"]!)} }`;
  return `// Generated from src/lumen.css by scripts/gen-tokens.ts (pnpm --filter @speakkit/ui gen:tokens). Do not edit.
/** Lockix light colour tokens, keyed by custom property name without the leading dashes. For code that cannot read CSS variables (badges, native window colours, pages without lumen.css). Speak Kit has no dark theme. */
const light = ${JSON.stringify(light, null, 2)} as const;

/** \`dark\` is a transitional alias of \`light\` so callers that still index by theme keep compiling; remove it with those callers. */
export const tokens = { light, dark: light } as const;

/** The few tokens native code (Electron window backgrounds, title bar overlay) needs. */
const nativeLight = ${native(light)} as const;
export const nativeTokens = { light: nativeLight, dark: nativeLight } as const;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeFileSync(TOKENS_FILE, renderTokens(readFileSync(CSS_FILE, "utf8")));
