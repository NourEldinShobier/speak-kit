import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

describe("manifest", () => {
  it("asks for the loopback address only; the extension contacts 127.0.0.1", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
  });

  it("asks for the tabs permission only when the user turns on site-aware dictation, so the install shows no history warning", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.permissions).toContain("alarms");
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.optional_permissions).toEqual(["tabs"]);
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
  });

  it("does not ask to read the clipboard; the user pastes into the page's own fields", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.permissions).not.toContain("clipboardRead");
  });
});
