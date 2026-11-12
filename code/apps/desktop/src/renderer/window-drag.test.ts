import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const css = readFileSync(new URL("./shell.css", import.meta.url), "utf8").replaceAll("\r\n", "\n");

/** The declarations of a rule whose selector starts a line (not one nested in a longer selector). */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
}

describe("moving the window", () => {
  it("the title bar and the non-interactive parts of the sidebar are drag areas", () => {
    for (const s of [".sk-title", ".sk-side__spacer", ".sk-side__head"]) expect(rule(s), s).toContain("-webkit-app-region: drag");
  });

  it("buttons and fields in a drag area stay clickable", () => {
    expect(rule(".sk-title button,\n.sk-title a,\n.sk-title input,\n.sk-title .lm-pill")).toContain("no-drag");
    expect(rule(".sk-side__head button,\n.sk-side__head input")).toContain("no-drag");
  });

  it("the nav list itself is not a drag area, so its links keep working", () => {
    expect(rule(".sk-side > .lm-nav")).not.toContain("drag");
  });
});
