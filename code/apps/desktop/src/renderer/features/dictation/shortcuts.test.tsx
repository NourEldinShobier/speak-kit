import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { DEFAULT_DICTATION } from "../../../shared/dictation/settings";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitDictation: {} };
});

import { ShortcutsSections } from "./ShortcutsSection";
import { allShortcuts, conflictText, isDefault, shortcutLead } from "./shortcuts-model";

const base: DictationStatus = {
  supported: true,
  enabled: true,
  hotkeyReady: true,
  phase: "idle",
  settings: {
    ...DEFAULT_DICTATION,
    enabled: true,
    hotkey: "ControlRight",
    mode: "hold",
    pasteLastHotkey: "ControlLeft+AltLeft+KeyV",
    cancelKey: "Escape",
    language: "auto",
    model: "large-v3-turbo-q5_0",
    retention: "7d",
    replacements: [],
  },
  models: [],
  modelInstalled: true,
  modelReady: true,
  historyCount: 0,
  historyStatus: "ok",
  historyRev: 0,
  keptRecordings: 0,
  rewriteKey: false,
  paused: false,
  platform: "win32",
  readerShortcuts: { "read-selection": "Ctrl+Alt+S" },
  mic: { kind: "ready", label: "Microphone Array" },
  devices: [],
};
const withSettings = (over: Partial<DictationStatus["settings"]>, rest: Partial<DictationStatus> = {}): DictationStatus => ({ ...base, ...rest, settings: { ...base.settings, ...over } });
const text = (s: DictationStatus) =>
  renderToStaticMarkup(<ShortcutsSections s={s} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

const buttonOf = (html: string, name: string) => html.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? "missing";

describe("shortcuts page", () => {
  it("shows every row of the default state, with Restore default disabled", () => {
    const html = renderToStaticMarkup(<ShortcutsSections s={base} />);
    const t = text(base);
    for (const s of ["Dictation shortcut", "Right Ctrl", "Shortcut mode", "Hold or double-tap", "Paste last dictation", "Learn correction"]) expect(t).toContain(s);
    for (const s of ["Hold time", "Dictate without processing", "How Hold or double-tap works"]) expect(t).not.toContain(s);
    expect(buttonOf(html, "Restore the default Dictation shortcut")).toContain("disabled");
    expect(t).toContain("Hold the key to talk. Let go to insert the text.");
    expect(t).not.toContain("Second shortcut");
    expect(t).not.toContain("Mouse button");
  });

  it("gives every control an accessible name", () => {
    const html = renderToStaticMarkup(<ShortcutsSections s={base} />);
    for (const name of ["Change Dictation shortcut", "Change Paste last dictation", "Add shortcut: Learn correction"]) expect(html).toContain(`aria-label="${name}"`);
  });

  it("offers the Learn correction shortcut as not set, with the one-read promise, and shows it once set", () => {
    const t = text(base);
    expect(t).toContain("Learn correction");
    expect(t).toContain("Not set");
    expect(t).toContain("reads that text once, when you press the key");
    expect(text(withSettings({ learnHotkey: "ControlLeft+AltLeft+KeyL" }))).not.toContain("Not set");
  });

  it("lets the Learn correction shortcut be cleared again with Restore default", () => {
    const unset = renderToStaticMarkup(<ShortcutsSections s={base} />);
    expect(unset).not.toContain("Restore the default Learn correction");
    const set = renderToStaticMarkup(<ShortcutsSections s={withSettings({ learnHotkey: "ControlLeft+AltLeft+KeyL" })} />);
    expect(buttonOf(set, "Restore the default Learn correction")).not.toContain("disabled");
  });

  it("enables Restore default once Paste last is changed", () => {
    const html = renderToStaticMarkup(<ShortcutsSections s={withSettings({ pasteLastHotkey: "ControlLeft+ShiftLeft+KeyV" })} />);
    expect(buttonOf(html, "Restore the default Paste last dictation")).not.toContain("disabled");
  });

  it("words the mode that is selected, and the amber banner says a clashing shortcut was cleared", () => {
    const t = text(withSettings({ mode: "tap-or-hold", resetNotice: "clash" }));
    expect(t).toContain("Hold the key to talk, or tap it to start and tap again to finish.");
    expect(t).toContain("A shortcut was reset");
    expect(t).toContain("Two shortcuts shared a key, so the extra one was cleared.");
  });

  it("shows the Cancel key in the main section for the hands-free modes only, and no Advanced fold", () => {
    expect(text(base)).not.toContain("Cancel key");
    const t = text(withSettings({ mode: "toggle" }));
    expect(t).toContain("Cancel key");
    expect(t).toContain("Escape");
    expect(text(withSettings({ mode: "tap-or-hold" }))).toContain("Cancel key");
    for (const s of ["Advanced shortcut options", "Share the shortcut with other apps", "Pause in some programs", "Clean up the field"]) expect(t).not.toContain(s);
  });

  it("says why a mode cannot be delivered on a computer without the key listener", () => {
    expect(text({ ...base, supported: false })).toContain("Shortcuts need a system-wide key listener");
  });
});

describe("shortcut model", () => {
  it("has a lead for each mode", () => {
    for (const mode of ["hold", "hold-only", "toggle", "double-tap", "tap-or-hold"] as const) expect(shortcutLead[mode].length).toBeGreaterThan(10);
  });

  it("collects every shortcut, including the reader ones, and words a conflict", () => {
    expect(allShortcuts({ ...base, settings: { ...base.settings, learnHotkey: "F8" } })).toMatchObject({ learn: "F8" });
    expect(allShortcuts(base)).toMatchObject({ dictation: "ControlRight", pasteLast: "ControlLeft+AltLeft+KeyV", cancel: "Escape", "read-selection": "Ctrl+Alt+S" });
    expect(conflictText("ControlRight", "dictation")).toBe("Right Ctrl is already the Dictation shortcut. Pick another shortcut.");
    expect(isDefault("dictation", "ControlRight")).toBe(true);
    expect(isDefault("pasteLast", "F9")).toBe(false);
  });
});
