import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";
import { buildCommands, DEFAULT_RECENT, filterCommands, paletteView, rememberCommand } from "./model";

const voices: Voice[] = [
  { id: "af_bella", name: "Bella", lang: "en-US", gender: "female", quality: "A", traits: "warm" },
  { id: "bm_george", name: "George", lang: "en-GB", gender: "male", quality: "C" },
];
const doc = (id: string, title: string, wordCount: number) => ({ id, title, wordCount, origin: "example.com" }) as DocMeta;
const docs = [doc("d1", "Meeting notes 12 Nov", 320), doc("d2", "Chapter 4 draft", 40)];
const all = buildCommands(voices, docs);
const titles = (q: string) => filterCommands(all, q).map((c) => c.title);

describe("commands", () => {
  it("has no New reading command", () => {
    expect(all.some((c) => /new reading/i.test(c.title))).toBe(false);
  });
  it("opens the Dictation page with a keyboard icon", () => {
    const c = all.find((x) => x.id === "page-dictation")!;
    expect([c.title, c.icon, c.action]).toEqual(["Open Dictation", "keyboard", { type: "nav", page: "dictation" }]);
  });
  it("has a page command for every menu item and a settings command for every settings page", () => {
    expect(all.filter((c) => c.group === "Pages")).toHaveLength(10);
    expect(all.filter((c) => c.group === "Settings")).toHaveLength(14);
  });
  it("builds readings with minutes and voices with a Voice hint", () => {
    expect(all.find((c) => c.id === "d-d1")).toMatchObject({ group: "Readings", hint: "2 min", action: { type: "open-doc", id: "d1" } });
    expect(all.find((c) => c.id === "d-d2")!.hint).toBe("1 min");
    expect(all.find((c) => c.id === "v-af_bella")).toMatchObject({ title: "Bella", hint: "Voice" });
  });
});

describe("filter", () => {
  it("matches nothing for an empty or blank query", () => {
    expect(titles("")).toEqual([]);
    expect(titles("   ")).toEqual([]);
  });
  it("finds a voice by name and by id, case-insensitively", () => {
    expect(titles("BELLA")).toEqual(["Bella"]);
    expect(titles("bm_geo")).toEqual(["George"]);
  });
  it("finds readings by title and origin", () => {
    expect(titles("chapter")).toEqual(["Chapter 4 draft"]);
    expect(titles("example.com")).toEqual(["Meeting notes 12 Nov", "Chapter 4 draft"]);
  });
  it("matches keywords and requires every word", () => {
    expect(titles("idle")).toEqual(["Settings: Performance"]);
    expect(titles("settings performance")).toEqual(["Settings: Performance"]);
    expect(titles("performance zzz")).toEqual([]);
  });
  it("ranks a title that starts with the word first", () => {
    expect(titles("pause")[0]).toBe("Pause");
  });
  it("offers the system actions", () => {
    expect(filterCommands(all, "clipboard")).toEqual([]);
    expect(filterCommands(all, "mp3")[0]!.action).toEqual({ type: "export" });
    expect(filterCommands(all, "disturb")[0]!.action).toEqual({ type: "dnd" });
    expect(filterCommands(all, "chrome")[0]!.action).toEqual({ type: "install-extension" });
    expect(filterCommands(all, "global keys")[0]!.action).toEqual({ type: "nav", page: "settings", sub: "shortcuts" });
    expect(filterCommands(all, "browser integration")[0]!.action).toEqual({ type: "nav", page: "settings", sub: "browser" });
  });
  it("returns at most 30 results", () => {
    const many = buildCommands(
      [],
      Array.from({ length: 80 }, (_, i) => doc(`x${i}`, `Note ${i}`, 10)),
    );
    expect(filterCommands(many, "note")).toHaveLength(30);
  });
});

describe("view", () => {
  it("empty query shows Recent from the defaults, then the other actions, and no voices", () => {
    const v = paletteView(all, "", []);
    expect(v.best).toBeNull();
    expect(v.sections.map((s) => s.label)).toEqual(["Recent", "Actions"]);
    expect(v.sections[0]!.items.map((c) => c.title)).toEqual(["Open Dictation", "Play or pause reading", "Export audio"]);
    expect(v.sections[1]!.items.map((c) => c.title)).not.toContain("Export audio");
    expect(v.flat.some((c) => c.group === "Voices" || c.group === "Readings")).toBe(false);
    expect(DEFAULT_RECENT).toHaveLength(3);
  });
  it("shows the commands that were run, newest first, and skips ids that no longer exist", () => {
    const v = paletteView(all, "", ["logs", "gone", "pause"]);
    expect(v.sections[0]!.items.map((c) => c.id)).toEqual(["logs", "pause"]);
  });
  it("a query gives the best match first, then the rest grouped by kind", () => {
    const v = paletteView(all, "e", []);
    expect(v.best).toBe(v.flat[0]);
    expect(v.sections.every((s) => !s.items.includes(v.best!))).toBe(true);
    expect(v.flat).toHaveLength(filterCommands(all, "e").length);
    const labels = v.sections.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it("a query with no match has no best card and no sections", () => {
    expect(paletteView(all, "dictatn zz", [])).toEqual({ best: null, sections: [], flat: [] });
  });
  it("walks the keys in the order drawn", () => {
    const v = paletteView(all, "o", []);
    expect(v.flat).toEqual([v.best, ...v.sections.flatMap((s) => s.items)]);
  });
});

describe("rememberCommand", () => {
  it("puts the newest first without repeats and keeps three", () => {
    expect(rememberCommand(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(rememberCommand(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
  });
});
