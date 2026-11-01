import { describe, expect, it } from "vite-plus/test";
import { defaultSettings } from "./settings";

describe("defaultSettings", () => {
  it("returns the shipped defaults", () => {
    expect(defaultSettings()).toEqual({
      port: 47615,
      launcher: { enabled: true, side: "right", idle: "peek", openOn: "hover", closeDelayMs: 1500, widerWhileReading: true, y: 0.42 },
      show: { bubble: true, dock: true, gutter: true, contextMenu: true, autoScroll: true },
      voice: "af_heart",
      speed: 1.2,
      pauseBetweenParagraphs: "short",
      highlight: { mode: "sentence+word", sentenceColor: "#FFF1C2", wordColor: "#FFD24D", matchTheme: true },
      skip: { navigation: true, citations: true, code: true, urls: true, captions: false },
      sites: {},
      siteDefault: "ask",
    });
  });

  it("returns a fresh object each call so one caller cannot change another's settings", () => {
    const a = defaultSettings();
    a.sites["example.com"] = "never-read";
    a.launcher.side = "left";
    expect(defaultSettings().sites).toEqual({});
    expect(defaultSettings().launcher.side).toBe("right");
  });
});
