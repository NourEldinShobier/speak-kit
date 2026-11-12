import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

describe("manifest", () => {
  it("asks for the loopback address only; the extension contacts 127.0.0.1", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
  });

  it("reads the address of tabs only to tell the app on this computer which website is in front", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.permissions).toEqual(expect.arrayContaining(["tabs", "alarms"]));
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
  });

  it("does not ask to read the clipboard; the user pastes into the page's own fields", () => {
    const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.permissions).not.toContain("clipboardRead");
  });
});
