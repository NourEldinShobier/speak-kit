import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { browserPlatform } from "@speakkit/ui";
import { kitSubset } from "../build/kit-subset";

const kit = kitSubset(readFileSync(new URL("../../../packages/ui/src/styles.css", import.meta.url), "utf8"));

describe("in-page kit styles keep the per-platform radii", () => {
  test("the content subset carries the macOS defaults and the Windows override", () => {
    expect(kit).toContain(":root,:host{--radius-dialog:16px;--radius-panel:14px;--radius-tray:14px;");
    expect(kit).toContain('[data-platform="win32"]{--radius-dialog:10px;--radius-panel:8px;--radius-tray:10px;--radius-menu:10px;--radius-window:10px;--radius-card:8px}');
  });

  test("browserPlatform maps the user-agent platform to the data-platform value", () => {
    expect(browserPlatform({ userAgentData: { platform: "Windows" }, platform: "Win32" })).toBe("win32");
    expect(browserPlatform({ platform: "MacIntel" })).toBe("darwin");
    expect(browserPlatform({ userAgentData: { platform: "macOS" } })).toBe("darwin");
    expect(browserPlatform({ platform: "Linux x86_64" })).toBe("linux");
    expect(browserPlatform({})).toBe("linux");
  });
});
