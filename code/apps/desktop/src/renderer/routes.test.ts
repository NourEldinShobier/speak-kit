import { describe, expect, it } from "vite-plus/test";
import { PAGES, SETTINGS_SUBS } from "../shared/ipc";
import { filterSettingsNav, MENU, menuItem, SETTINGS_NAV, settingsItem } from "./routes";

describe("routes", () => {
  it("the menu groups and rows are in the designed order", () => {
    expect(MENU.map((g) => [g.group, g.items.map((i) => i.label)])).toEqual([
      ["Read", ["Home", "Library"]],
      ["Voice", ["Voices", "Voice chat", "Engines"]],
      ["Dictation", ["Dictation", "Modes", "Vocabulary", "History"]],
      ["Capture", ["Capture"]],
    ]);
  });
  it("Engines uses the cube icon and Browser is not a page", () => {
    expect(menuItem("engines").icon).toBe("package");
    expect(PAGES as readonly string[]).not.toContain("browser");
  });
  it("every route id has a menu row or a settings row, and nothing else", () => {
    expect(MENU.flatMap((g) => g.items.map((i) => i.page)).sort()).toEqual(PAGES.filter((p) => p !== "settings").sort());
    expect(SETTINGS_NAV.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual([...SETTINGS_SUBS].sort());
    expect(settingsItem("performance").label).toBe("Performance");
  });
});

describe("filterSettingsNav", () => {
  const ids = (q: string) => filterSettingsNav(q).flatMap((g) => g.items.map((i) => i.id));
  it("returns every row for blank text", () => {
    expect(ids("  ")).toHaveLength(14);
  });
  it("matches label or keywords, every word, any case", () => {
    expect(ids("SHORTCUTS")).toEqual(["shortcuts"]);
    expect(ids("hotkey record")).toEqual(["shortcuts"]);
  });
  it("drops empty groups and returns nothing for no match", () => {
    expect(filterSettingsNav("shortcuts").map((g) => g.group)).toEqual(["General"]);
    expect(ids("zzzz")).toEqual([]);
  });
});

describe("settings icons", () => {
  it("use the lock, camera, prompt and pulse glyphs of the design", () => {
    const icon = (id: string) => SETTINGS_NAV.flatMap((g) => g.items).find((i) => i.id === id)?.icon;
    expect([icon("privacy"), icon("meetings"), icon("automation"), icon("diagnostics")]).toEqual(["lock", "video", "terminal", "activity"]);
  });
});
