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
});
