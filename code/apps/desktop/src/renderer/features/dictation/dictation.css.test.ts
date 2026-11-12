import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const css = readFileSync(new URL("./dictation.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
/** The declarations of the rule that starts with exactly this selector. */
const rule = (selector: string): string => css.split(/\n(?=[.@])/).find((block) => block.startsWith(`${selector} {`)) ?? "";

describe("dictation styles", () => {
  it("shows the invalid-hotkey message in the Hotkey row, not pinned to a distant ancestor", () => {
    expect(rule(".dict-hotkey__problem")).not.toBe("");
    expect(rule(".dict-hotkey__problem")).not.toContain("position");
    expect(rule(".dict-hotkey")).toContain("flex-wrap: wrap");
  });

  it("gives the history buttons the 36 px control size, 80 px for the pair", () => {
    expect(css).not.toContain(".dict-hist__acts .lm-btn--icon");
    expect(rule(".dict-hist__acts")).toContain("inline-size: 80px");
  });

  it("positions the hidden status text against its own row of buttons", () => {
    expect(rule(".dict-hist__acts")).toContain("position: relative");
    expect(rule(".dict-hist__sr")).toContain("position: absolute");
  });
});

describe("the dictation pill and Reduce motion", () => {
  const hud = readFileSync(new URL("./hud.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  it("stops the level-bar transition and the spinner when the page is marked reduce", () => {
    expect(hud).toMatch(/:root\[data-reduce-motion="on"\] \.hud__bars i \{\s*transition: none;/);
    expect(hud).toMatch(/:root\[data-reduce-motion="on"\] \.hud \.lm-spin \{\s*animation: none;/);
  });
});
