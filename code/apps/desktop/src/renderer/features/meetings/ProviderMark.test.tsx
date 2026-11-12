import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { ProviderMark } from "./ProviderMark";

describe("ProviderMark", () => {
  it.each(["teams", "zoom", "meet", "slack", "discord", "manual"])("draws a glyph for %s", (id) => {
    expect(renderToStaticMarkup(<ProviderMark providerId={id} name="X" />)).toContain(`data-provider="${id}"`);
  });
  it("falls back to two letters of the app name", () => {
    expect(renderToStaticMarkup(<ProviderMark providerId="webex" name="webex call" />)).toBe("We");
  });
  it("falls back to Mt for a blank name", () => {
    expect(renderToStaticMarkup(<ProviderMark providerId="x" name="  " />)).toBe("Mt");
  });
});
