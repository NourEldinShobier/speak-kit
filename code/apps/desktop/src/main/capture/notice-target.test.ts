import path from "node:path";
import { describe, expect, it } from "vitest";
import { externalFor } from "./notice-target";

describe("what a notice button opens", () => {
  it("opens the sound settings of the system", () => {
    expect(externalFor("open-audio", "win32", "/home/a")).toEqual({ kind: "url", value: "ms-settings:sound" });
    expect(externalFor("open-audio", "darwin", "/Users/a")).toEqual({ kind: "url", value: "x-apple.systempreferences:com.apple.preference.sound" });
  });
  it("opens the Recycle Bin on Windows and the Trash folder in the home folder on macOS", () => {
    expect(externalFor("open-trash", "win32", "/home/a")).toEqual({ kind: "url", value: "shell:RecycleBinFolder" });
    expect(externalFor("open-trash", "darwin", "/Users/a")).toEqual({ kind: "path", value: path.join("/Users/a", ".Trash") });
  });
  it("opens nothing for the other buttons", () => {
    expect(externalFor("retry", "win32", "")).toBeUndefined();
    expect(externalFor("open-permissions", "darwin", "")).toBeUndefined();
  });
});
