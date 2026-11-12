import { describe, expect, it } from "vite-plus/test";
import { SETTINGS_SUBS } from "../ipc";
import { firstResult, SETTING_ROWS, searchSettings, splitMatch } from "./search-index";

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

  it("groups by page and Enter opens the first row", () => {
    const g = searchSettings("log", label);
    expect(new Set(g.map((x) => x.page)).size).toBe(g.length);
    expect(firstResult(g)).toBe(g[0]!.rows[0]);
    expect(firstResult([])).toBeNull();
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
