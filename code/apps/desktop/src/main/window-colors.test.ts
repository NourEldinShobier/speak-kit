import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { appBackground, setupBackground } from "./window-colors";

const css = readFileSync(new URL("../../../../packages/ui/src/styles.css", import.meta.url), "utf8");
/** Value of a custom property in the first rule that sets it. */
const token = (name: string) => css.split(`--${name}:`)[1]?.split(";")[0]?.trim();

describe("native window colors", () => {
  it("setup runs on white, like the settings panel", () => {
    expect(setupBackground()).toBe("#ffffff");
    expect(token("surface-card")?.toLowerCase()).toBe(setupBackground());
  });

  it("match the custom property in styles.css", () => {
    expect(token("surface-window")?.toLowerCase()).toBe(appBackground());
  });
});
