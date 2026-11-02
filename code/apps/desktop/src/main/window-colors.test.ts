import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { appBackground, titleBarSymbol } from "./window-colors";

const css = readFileSync(new URL("../../../../packages/ui/src/lumen.css", import.meta.url), "utf8");
/** Value of a custom property in the first rule that sets it. */
const token = (name: string) => css.split(`--${name}:`)[1]?.split(";")[0]?.trim();

describe("native window colors", () => {
  it("are the Lockix window grey and the strongest glyph colour", () => {
    expect([appBackground(), titleBarSymbol()]).toEqual(["#f0f0f0", "#000000"]);
  });

  it("match the custom property in lumen.css", () => {
    expect(token("surface-window")?.toLowerCase()).toBe(appBackground());
  });
});
