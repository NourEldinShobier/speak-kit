import { describe, expect, it } from "vite-plus/test";
import { SETTINGS_SUBS } from "../ipc";
import { QUICK_TOPICS, SETTING_ROWS, searchSettings, splitMatch } from "./search-index";

const label = (p: string) => p[0]!.toUpperCase() + p.slice(1);

describe("settings search", () => {
  it("finds a row behind the Advanced fold", () => {
    const g = searchSettings("settings file", label);
    expect(g[0]).toMatchObject({ page: "general" });
    expect(g[0]!.rows[0]).toMatchObject({ id: "general/settings-file", advanced: true });
  });

  it("every typed word must match and an empty query finds nothing", () => {
    expect(searchSettings("", label)).toEqual([]);
    expect(searchSettings("   ", label)).toEqual([]);
    expect(searchSettings("zzzz", label)).toEqual([]);
    expect(searchSettings("battery laptop", label)[0]!.rows.map((x) => x.id)).toEqual(["performance/battery"]);
    expect(searchSettings("battery zzzz", label)).toEqual([]);
  });

  it("matches keywords and the page name, label hits first", () => {
    const g = searchSettings("memory", label);
    expect(g.map((x) => x.page)[0]).toBe("performance");
    expect(searchSettings("hotkey", label)[0]).toMatchObject({ page: "shortcuts" });
    expect(searchSettings("Accessibility", label)[0]!.page).toBe("accessibility");
  });

  it("finds the record shortcut", () => {
    expect(searchSettings("record", label)[0]!.rows.map((x) => x.id)).toContain("shortcuts/record-toggle");
  });

  it("groups by page", () => {
    const g = searchSettings("log", label);
    expect(new Set(g.map((x) => x.page)).size).toBe(g.length);
  });

  it("is case-insensitive", () => {
    expect(searchSettings("BATTERY", label)[0]!.rows[0]!.id).toBe("performance/battery");
  });

  it("splits the label around the longest typed word", () => {
    expect(splitMatch("Launch at login", "log")).toEqual({ before: "Launch at ", match: "log", after: "in" });
    expect(splitMatch("Language", "zz")).toEqual({ before: "Language", match: "", after: "" });
    expect(splitMatch("Language", "")).toEqual({ before: "Language", match: "", after: "" });
  });

  it("row ids are unique and belong to real pages", () => {
    expect(new Set(SETTING_ROWS.map((x) => x.id)).size).toBe(SETTING_ROWS.length);
    for (const row of SETTING_ROWS) expect(SETTINGS_SUBS).toContain(row.page);
  });
});

describe("search ordering and splitting", () => {
  const rows = [
    { id: "a/one", page: "general" as const, label: "Zebra", keywords: "tray" },
    { id: "a/two", page: "voice" as const, label: "Tray icon", keywords: "" },
    { id: "a/three", page: "general" as const, label: "Other", keywords: "tray" },
  ];
  it("puts label hits before keyword hits, then keeps the list order, grouped by page in that order", () => {
    const g = searchSettings("tray", label, rows);
    expect(g.map((x) => [x.page, x.rows.map((r) => r.id)])).toEqual([
      ["voice", ["a/two"]],
      ["general", ["a/one", "a/three"]],
    ]);
  });

  it("splits typed words on any run of white space", () => {
    expect(searchSettings("tray   icon", label, rows)[0]!.rows.map((r) => r.id)).toEqual(["a/two"]);
    expect(searchSettings("tray\ticon", label, rows)[0]!.rows.map((r) => r.id)).toEqual(["a/two"]);
  });

  it("looks in the page name too", () => {
    expect(searchSettings("general", (p) => (p === "general" ? "General" : "Elsewhere"), rows)[0]!.rows.map((r) => r.id)).toEqual(["a/one", "a/three"]);
  });

  it("a match at the very start of the label has an empty before part", () => {
    expect(splitMatch("Language", "lang")).toEqual({ before: "", match: "Lang", after: "uage" });
  });

  it("uses the longest typed word for the bold part", () => {
    expect(splitMatch("Launch at login", "at login")).toEqual({ before: "Launch at ", match: "login", after: "" });
  });

  it("offers these quick topics", () => {
    expect(QUICK_TOPICS).toEqual(["Shortcuts", "Microphone", "Memory", "Updates", "Logs"]);
  });
});
