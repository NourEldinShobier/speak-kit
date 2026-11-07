import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { click, installDom, mount, text } from "../../testing/dom";
import { ShortcutsSection } from "./ShortcutsSection";
import { unassignedSuggestions } from "./useCommands";

const MANIFEST = {
  "read-selection": { suggested_key: { default: "Ctrl+Shift+S" } },
  "play-pause": { suggested_key: { default: "Ctrl+Shift+Y" } },
  stop: { suggested_key: { default: "Ctrl+Shift+X" } },
};

const stubChrome = (commands: { name: string; shortcut: string }[]) => {
  (globalThis as Record<string, unknown>).chrome = {
    commands: { getAll: () => Promise.resolve(commands) },
    runtime: { getManifest: () => ({ commands: MANIFEST }) },
    tabs: { create: vi.fn() },
  };
};

beforeEach(installDom);
afterEach(() => delete (globalThis as Record<string, unknown>).chrome);

describe("unassignedSuggestions", () => {
  test("lists commands that have a suggested key but no assigned shortcut", () => {
    const cmds = [
      { name: "read-selection", shortcut: "" },
      { name: "play-pause", shortcut: "Ctrl+Shift+Y" },
      { name: "_execute_action", shortcut: "" },
    ];
    expect(unassignedSuggestions(cmds, MANIFEST)).toEqual({ "read-selection": "Ctrl+Shift+S" });
  });

  test("is empty without a manifest or when every key is assigned", () => {
    expect(unassignedSuggestions([{ name: "stop", shortcut: "" }], undefined)).toEqual({});
    expect(unassignedSuggestions([{ name: "stop", shortcut: "Ctrl+Shift+X" }], MANIFEST)).toEqual({});
  });
});

describe("ShortcutsSection (C6, C16)", () => {
  test("shows the keys Chrome assigned and no warning", async () => {
    stubChrome([
      { name: "read-selection", shortcut: "Ctrl+Shift+S" },
      { name: "play-pause", shortcut: "Ctrl+Shift+Y" },
      { name: "stop", shortcut: "Ctrl+Shift+X" },
    ]);
    const m = await mount(<ShortcutsSection />);
    const rows = [...m.root.querySelectorAll("[data-command]")].map((r) => `${r.getAttribute("data-command")}: ${text(r.querySelector(".lm-kbds") ?? r.querySelector(".op-notset"))}`);
    expect(rows).toEqual(["read-selection: CtrlShiftS", "play-pause: CtrlShiftY", "stop: CtrlShiftX"]);
    expect(m.root.querySelector(".op-conflict")).toBeNull();
    await m.unmount();
  });

  test("a command Chrome left unassigned gets a Not assigned badge and a banner that sends the user to Chrome's shortcut page", async () => {
    stubChrome([
      { name: "read-selection", shortcut: "" },
      { name: "play-pause", shortcut: "Ctrl+Shift+Y" },
      { name: "stop", shortcut: "Ctrl+Shift+X" },
    ]);
    const m = await mount(<ShortcutsSection />);
    const row = m.root.querySelector('[data-command="read-selection"]')!;
    expect(text(row.querySelector(".op-notset"))).toBe("Not assigned");
    expect(m.root.querySelectorAll(".op-notset .lm-pill").length).toBe(1);
    expect(text(m.root.querySelector(".op-conflict .lm-banner__title"))).toBe("A shortcut is not assigned");
    const choose = m.root.querySelector(".op-conflict button")!;
    expect([text(choose), choose.className]).toEqual(["Choose keys in Chrome", "lm-btn lm-btn--primary"]);
    await click(choose);
    expect((globalThis as unknown as { chrome: { tabs: { create: ReturnType<typeof vi.fn> } } }).chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome://extensions/shortcuts" });
    await m.unmount();
  });

  test("each row ends in a cluster of the keys (or the badge) and a 36 px pencil button, right-aligned", async () => {
    stubChrome([
      { name: "read-selection", shortcut: "" },
      { name: "play-pause", shortcut: "Ctrl+Shift+Y" },
      { name: "stop", shortcut: "Ctrl+Shift+X" },
    ]);
    const m = await mount(<ShortcutsSection />);
    const cluster = (cmd: string) => m.root.querySelector(`[data-command="${cmd}"] .op-keycluster`)!;
    const parts = (cmd: string) => [...cluster(cmd).children].map((c) => `${c.className} | ${c.getAttribute("aria-label") ?? text(c)}`);
    expect(parts("play-pause")).toEqual(["lm-kbds | CtrlShiftY", "lm-btn lm-btn--icon | Change shortcut for Play / pause"]);
    expect(parts("read-selection")).toEqual(["op-notset | Not assigned", "lm-btn lm-btn--icon | Change shortcut for Read selection"]);
    expect(m.root.querySelector('[data-command="play-pause"]')!.lastElementChild).toBe(cluster("play-pause"));
    await m.unmount();
  });

  test("Edit in Chrome is a 36 px secondary button", async () => {
    stubChrome([{ name: "stop", shortcut: "Ctrl+Shift+X" }]);
    const m = await mount(<ShortcutsSection />);
    const edit = [...m.root.querySelectorAll(".op-card-top button")].find((b) => text(b) === "Edit in Chrome")!;
    expect(edit.className).toBe("lm-btn lm-btn--secondary");
    await m.unmount();
  });

  test("On this page lists four fixed keys in two columns, each with its chips and a disabled pencil in one cluster", async () => {
    stubChrome([]);
    const m = await mount(<ShortcutsSection />);
    const rows = [...m.root.querySelectorAll(".op-grid2.keys .op-keyrow")].map((r) => `${text(r.querySelector(".lm-row__label"))}: ${text(r.querySelector(".op-keycluster .lm-kbds"))}`);
    expect(rows).toEqual(["Next paragraph: →", "Previous paragraph: ←", "Faster / slower: ↑↓", "Stop and close dock: Esc"]);
    const pencils = [...m.root.querySelectorAll(".op-grid2.keys .op-keycluster > button")];
    expect(pencils.map((b) => [b.className, b.hasAttribute("disabled")])).toEqual(Array(4).fill(["lm-btn lm-btn--icon", true]));
    await m.unmount();
  });
});
