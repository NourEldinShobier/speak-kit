import { describe, expect, it } from "vite-plus/test";
import { defaultSettings } from "./settings";

describe("defaultSettings", () => {
  it("returns a fresh object each call so one caller cannot change another's settings", () => {
    const a = defaultSettings();
    a.sites["example.com"] = "never-read";
    a.launcher.enabled = false;
    expect(defaultSettings().sites).toEqual({});
    expect(defaultSettings().launcher.enabled).toBe(true);
  });
});
