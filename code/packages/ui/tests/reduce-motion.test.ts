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
});
