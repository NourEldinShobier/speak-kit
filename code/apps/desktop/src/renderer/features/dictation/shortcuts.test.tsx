import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { DictationStatus } from "../../../shared/dictation/contract";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitDictation: {} };
});

import { ShortcutsSections } from "./ShortcutsSection";
import { allShortcuts, conflictText, explainerFrames, isDefault, modeRules, parseApps, shareAvailable, shortcutLead } from "./shortcuts-model";

const base: DictationStatus = {
  supported: true,
  enabled: true,
  hotkeyReady: true,
  phase: "idle",
  settings: {
    enabled: true,
    hotkey: "ControlRight",
    mode: "hold",
    holdMs: 300,
    secondHotkey: "",
    mouseButton: "",
    rawHotkey: "",
    pasteLastHotkey: "ControlLeft+AltLeft+KeyV",
    cancelKey: "Escape",
    shareHotkey: false,
    pauseRules: { mode: "off", apps: [], fullscreen: false },
    language: "auto",
    model: "large-v3-turbo-q5_0",
    retention: "7d",
    replacements: [],
  },
  models: [],
  modelInstalled: true,
  modelReady: true,
  historyCount: 0,
  paused: false,
  readerShortcuts: { "read-selection": "Ctrl+Alt+S" },
};
const withSettings = (over: Partial<DictationStatus["settings"]>, rest: Partial<DictationStatus> = {}): DictationStatus => ({ ...base, ...rest, settings: { ...base.settings, ...over } });
const text = (s: DictationStatus) =>
  renderToStaticMarkup(<ShortcutsSections s={s} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

const buttonOf = (html: string, name: string) => html.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? "missing";

describe("shortcuts page", () => {
  it("shows every row of the default state, with Restore default disabled and nothing set", () => {
    const html = renderToStaticMarkup(<ShortcutsSections s={base} />);
    const t = text(base);
    for (const s of [
      "Dictation shortcut",
      "Right Ctrl",
      "Shortcut mode",
      "Hold or double-tap",
      "Hold time",
      "300 ms",
      "Second shortcut",
      "Add shortcut",
      "Mouse button",
      "Choose button",
      "Not set",
      "Dictate without processing",
      "Paste last dictation",
    ])
      expect(t).toContain(s);
    expect(buttonOf(html, "Restore the default Dictation shortcut")).toContain("disabled");
    expect(t).toContain("Hold the key to talk. Let go to insert the text.");
  });

  it("gives every control an accessible name", () => {
    const html = renderToStaticMarkup(<ShortcutsSections s={base} />);
    for (const name of ["Change Dictation shortcut", "Add shortcut: Second shortcut", "Choose button: Mouse button", "Add shortcut: Dictate without processing", "Change Paste last dictation"])
      expect(html).toContain(`aria-label="${name}"`);
  });

  it("shows a set second shortcut, a mouse button and a raw shortcut with Remove", () => {
    const s = withSettings({ secondHotkey: "ControlLeft+AltLeft+KeyD", mouseButton: "Mouse4", rawHotkey: "AltRight" });
    const t = text(s);
    expect(t).toContain("Mouse 4");
    expect(t).toContain("Right Alt");
    expect(t).toContain("Remove");
    expect(t).not.toContain("Choose button");
  });

  it("enables Restore default once Paste last is changed", () => {
    const html = renderToStaticMarkup(<ShortcutsSections s={withSettings({ pasteLastHotkey: "ControlLeft+ShiftLeft+KeyV" })} />);
    expect(buttonOf(html, "Restore the default Paste last dictation")).not.toContain("disabled");
  });

  it("explains the mode that is selected, and the amber banner says a saved left click was reset", () => {
    const t = text(withSettings({ mode: "tap-or-hold", resetNotice: "left-click" }));
    expect(t).toContain("How Tap or hold works");
    expect(t).toContain("Only your shortcut ends a dictation");
    expect(t).toContain("A shortcut was reset");
    expect(t).toContain("The left button cannot be a shortcut");
  });

  it("says why a mode cannot be delivered on a computer without the key listener", () => {
    expect(text({ ...base, supported: false })).toContain("Shortcuts need a system-wide key listener");
  });
});

describe("shortcut model", () => {
  it("has a rule list and a lead for each mode, and a frame for each kind of press", () => {
    for (const mode of ["hold", "hold-only", "toggle", "double-tap", "tap-or-hold"] as const) {
      expect(modeRules(mode, 300).length).toBeGreaterThan(0);
      expect(shortcutLead[mode].length).toBeGreaterThan(10);
      expect(explainerFrames(mode).length).toBeGreaterThan(0);
    }
    expect(explainerFrames("double-tap")).toEqual(["double"]);
    expect(modeRules("tap-or-hold", 300)[0]).toEqual({ label: "Hold longer than 300 ms", text: "Dictates until you let go, then inserts the text.", badge: "Hold" });
    expect(modeRules("hold-only", 500)[1]?.label).toBe("Press shorter than 500 ms");
  });

  it("offers sharing in Hold mode only and says why not otherwise", () => {
    expect(shareAvailable("hold-only")).toEqual({ ok: true, reason: "" });
    expect(shareAvailable("toggle").ok).toBe(false);
    expect(shareAvailable("hold").reason).toContain("Hands-free modes");
  });

  it("collects every shortcut, including the reader ones, and words a conflict", () => {
    expect(allShortcuts(base)).toMatchObject({ dictation: "ControlRight", pasteLast: "ControlLeft+AltLeft+KeyV", cancel: "Escape", "read-selection": "Ctrl+Alt+S" });
    expect(conflictText("ControlRight", "dictation")).toBe("Right Ctrl is already the Dictation shortcut. Pick another shortcut.");
    expect(isDefault("dictation", "ControlRight")).toBe(true);
    expect(isDefault("pasteLast", "F9")).toBe(false);
  });

  it("reads the program list as typed: trimmed, no empty entries, at most 50", () => {
    expect(parseApps(" game.exe , ,Editor,")).toEqual(["game.exe", "Editor"]);
    expect(parseApps("")).toEqual([]);
    expect(parseApps(Array.from({ length: 80 }, (_, i) => `a${i}`).join(","))).toHaveLength(50);
  });
});
