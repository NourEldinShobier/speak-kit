import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_TOOLBAR, FOOTER_IDS, HEADER_IDS, parseToolbar, toolbarReducer } from "./toolbar";

describe("parseToolbar", () => {
  it("shows every item by default", () => {
    expect(DEFAULT_TOOLBAR).toEqual({ header: [], footer: [] });
    expect(parseToolbar(undefined)).toEqual({ header: [], footer: [] });
    expect(parseToolbar("x")).toEqual({ header: [], footer: [] });
  });
  it("keeps known hidden items and drops a list with an unknown one", () => {
    expect(parseToolbar({ header: ["export"], footer: ["volume", "queue"] })).toEqual({ header: ["export"], footer: ["volume", "queue"] });
    expect(parseToolbar({ header: ["export", "mic"], footer: "all" })).toEqual({ header: [], footer: [] });
  });
});

describe("toolbarReducer", () => {
  it("hides an item once and shows it again", () => {
    const hidden = toolbarReducer(DEFAULT_TOOLBAR, { bar: "footer", id: "volume", shown: false });
    expect(hidden).toEqual({ header: [], footer: ["volume"] });
    expect(toolbarReducer(hidden, { bar: "footer", id: "volume", shown: false })).toEqual({ header: [], footer: ["volume"] });
    expect(toolbarReducer(hidden, { bar: "footer", id: "volume", shown: true })).toEqual({ header: [], footer: [] });
  });
  it("changes only the toolbar it is addressed to", () => {
    const cfg = toolbarReducer({ header: ["search"], footer: ["speed"] }, { bar: "header", id: "bookmark", shown: false });
    expect(cfg).toEqual({ header: ["search", "bookmark"], footer: ["speed"] });
  });
});

describe("toolbar items", () => {
  it("lists the five header icons and the five player controls in drawing order", () => {
    expect(HEADER_IDS).toEqual(["search", "display", "bookmark", "export", "outline"]);
    expect(FOOTER_IDS).toEqual(["speed", "voice", "sleep", "volume", "queue"]);
  });
});
