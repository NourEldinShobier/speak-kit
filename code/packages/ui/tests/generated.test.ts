import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const committed = (file: string) => readFileSync(resolve(src, file), "utf8").replaceAll("\r\n", "\n");

describe("generated sources match their generators", () => {
  test("src/icon-data.ts is what scripts/gen-icons.mjs produces (run gen:icons when this fails)", async () => {
    const { renderIconData } = await import("../scripts/gen-icons.mjs");
    expect(committed("icon-data.ts")).toBe(renderIconData());
  });

  // The logo master lives in designs/logo and needs its own npm install; without it the generator cannot load.
  test("src/logo-data.ts is what scripts/gen-logo.mjs produces (run node scripts/gen-logo.mjs when this fails)", async (ctx) => {
    const gen = await import("../scripts/gen-logo.mjs").catch(() => undefined);
    if (!gen) return ctx.skip();
    expect(committed("logo-data.ts")).toBe(gen.renderLogoData());
  });
});
