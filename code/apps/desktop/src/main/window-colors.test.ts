import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { appBackground, floatBackground, titleBarSymbol } from "./window-colors";

const css = readFileSync(new URL("../../../../packages/ui/src/lumen.css", import.meta.url), "utf8");
/** Value of a custom property in the first rule whose selector list contains `selector`. */
function token(selector: string, name: string): string | undefined {
  const open = css.indexOf("{", css.indexOf(selector));
  const body = css.slice(open, css.indexOf("}", open));
  return body.split(`--${name}:`)[1]?.split(";")[0]?.trim();
}

describe("native window colors", () => {
  it("are the Lumen surface tokens and the strongest glyph colour for each theme", () => {
    expect([appBackground(true), appBackground(false)]).toEqual(["#191a1b", "#f3f3f6"]);
    expect([floatBackground(true), floatBackground(false)]).toEqual(["#1e1f20", "#fafafd"]);
    expect([titleBarSymbol(true), titleBarSymbol(false)]).toEqual(["#ffffff", "#000000"]);
  });

  it("match the custom properties in lumen.css", () => {
    expect(token('[data-theme="dark"]', "surface-window")).toBe(appBackground(true));
    expect(token('[data-theme="dark"]', "surface-card")).toBe(floatBackground(true));
    expect(token('[data-theme="light"]', "surface-window")).toBe(appBackground(false));
    expect(token('[data-theme="light"]', "surface-card")).toBe(floatBackground(false));
  });
});
