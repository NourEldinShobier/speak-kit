import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { ProviderMark } from "./ProviderMark";

const category = (id: string) => /data-category="(\w+)"/.exec(renderToStaticMarkup(<ProviderMark providerId={id} name="X" />))?.[1];

describe("ProviderMark", () => {
  it.each([
    ["teams", "video"],
    ["zoom", "video"],
    ["slack", "chat"],
    ["discord", "chat"],
    ["meet", "browser"],
    ["manual", "manual"],
    ["unknown", "unknown"],
  ])("draws the %s glyph of the %s kind", (id, kind) => {
    expect(category(id)).toBe(kind);
  });
  it("draws a 16 px glyph with a 1.5 px stroke in the text colour", () => {
    const html = renderToStaticMarkup(<ProviderMark providerId="teams" name="Microsoft Teams" />);
    for (const attr of ['width="16"', 'height="16"', 'stroke-width="1.5"', 'stroke="currentColor"']) expect(html).toContain(attr);
  });
  it("falls back to two letters of the name of an app the user added", () => {
    expect(renderToStaticMarkup(<ProviderMark providerId="user-webex" name="webex call" />)).toBe("We");
  });
  it("falls back to Mt for a blank name", () => {
    expect(renderToStaticMarkup(<ProviderMark providerId="user-x" name="  " />)).toBe("Mt");
  });
});
