import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import { buildCommands, filterCommands } from "./model";

const voices: Voice[] = [
  { id: "af_bella", name: "Bella", lang: "en-US", gender: "female", quality: "A", traits: "warm" },
  { id: "bm_george", name: "George", lang: "en-GB", gender: "male", quality: "C" },
];
const titles = (q: string) => filterCommands(buildCommands(voices), q).map((c) => c.title);

describe("command palette", () => {
  it("empty query lists actions, pages and settings but not the voices", () => {
    const t = titles("");
    expect(t[0]).toBe("New reading");
    expect(t).toContain("Settings: Memory");
    expect(t.some((x) => x.startsWith("Preview"))).toBe(false);
  });
  it("finds a voice by name and by id, case-insensitively", () => {
    expect(titles("BELLA")).toEqual(["Preview Bella"]);
    expect(titles("bm_geo")).toEqual(["Preview George"]);
  });
  it("matches keywords and requires every word", () => {
    expect(titles("idle")).toEqual(["Settings: Memory"]);
    expect(titles("settings memory")).toEqual(["Settings: Memory"]);
    expect(titles("memory zzz")).toEqual([]);
  });
  it("ranks a title that starts with the word first", () => {
    expect(titles("pause")[0]).toBe("Pause");
  });
  it("offers the system actions: export, updates, Do not disturb, install the extension", () => {
    expect(filterCommands(buildCommands(), "clipboard")).toEqual([]); // Speak Kit never reads the clipboard on its own
    expect(filterCommands(buildCommands(), "mp3")[0]!.action).toEqual({ type: "export" });
    expect(filterCommands(buildCommands(), "disturb")[0]!.action).toEqual({ type: "dnd" });
    expect(filterCommands(buildCommands(), "chrome")[0]!.action).toEqual({ type: "install-extension" });
    expect(filterCommands(buildCommands(), "hotkey")[0]!.action).toEqual({ type: "nav", page: "settings", sub: "shortcuts" });
  });
  it("maps pages to nav actions", () => {
    const c = filterCommands(buildCommands(), "browser integration")[0]!;
    expect(c.action).toEqual({ type: "nav", page: "settings", sub: "browser" });
  });
});
