import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").replaceAll("\r\n", "\n");

describe("Reduce motion in the shared style sheet", () => {
  test("a page marked reduce gets no animation or smooth scrolling, wherever it is shown", () => {
    const start = css.indexOf(':root[data-reduce-motion="on"] *,');
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    for (const decl of ["animation-duration: 0.001ms !important", "animation-iteration-count: 1 !important", "transition-duration: 0.001ms !important", "scroll-behavior: auto !important"])
      expect(rule).toContain(decl);
    expect(rule).toContain("::before");
    expect(rule).toContain("::after");
  });

  test("the system preference rules do not apply when the app's own choice is Off", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce) {");
    const block = css.slice(start, css.indexOf("\n}\n", start));
    const selectors = block.split("\n").filter((l) => /^  [^ /].*[,{]$/.test(l));
    expect(selectors.length).toBeGreaterThan(5);
    for (const l of selectors) expect(l).toMatch(/^  :root:not\(\[data-reduce-motion="off"\]\) /);
  });
});
