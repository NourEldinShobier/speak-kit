import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").replaceAll("\r\n", "\n");

describe("Reduce motion in the shared style sheet", () => {
  test("the system preference gives every page no animation and no smooth scrolling", () => {
    const start = css.indexOf("@media (prefers-reduced-motion: reduce) {\n  *,");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("\n  }\n}", start));
    for (const decl of ["animation-duration: 0.001ms !important", "animation-iteration-count: 1 !important", "transition-duration: 0.001ms !important", "scroll-behavior: auto !important"])
      expect(rule).toContain(decl);
    expect(rule).toContain("*::before");
    expect(rule).toContain("*::after");
  });

  test("only the system preference decides: no app-level attribute is read", () => {
    expect(css).not.toContain("data-reduce-motion");
  });
});
