import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { findConflict, firstClash } from "./conflicts";
import { cancelVk, hotkeyLabels, isMouseKey, KEY_VK, unsupportedKey, usesAdvancedKey, validCancelKey, validHotkey } from "./keys";
import { interpretButton, interpretKeys } from "./recorder-model";
import { DictationPatchSchema } from "./settings";
import * as v from "valibot";

describe("keys added for activation", () => {
  it("accepts Home, End, Page Up, Page Down and Mouse 2 to 5 on their own", () => {
    for (const k of ["Home", "End", "PageUp", "PageDown", "Mouse2", "Mouse3", "Mouse4", "Mouse5"]) expect(validHotkey(k)).toBe(true);
  });

  it("refuses the left button and a letter on its own", () => {
    expect(validHotkey("Mouse1")).toBe(false);
    expect(validHotkey("KeyA")).toBe(false);
  });

  it("maps the dedicated navigation keys to codes the numpad keys can never produce", () => {
    expect(KEY_VK.Home).toBe(0x124);
    expect(KEY_VK.End).toBe(0x123);
    expect(KEY_VK.PageUp).toBe(0x121);
    expect(KEY_VK.PageDown).toBe(0x122);
    expect(KEY_VK.Mouse4).toBe(0x05);
  });

  it("labels the new keys and tells advanced and mouse keys apart", () => {
    expect(hotkeyLabels("PageDown")).toEqual(["Page Down"]);
    expect(hotkeyLabels("Mouse4")).toEqual(["Mouse 4"]);
    expect(usesAdvancedKey("ControlLeft+Home")).toBe(true);
    expect(usesAdvancedKey("F9")).toBe(false);
    expect(isMouseKey("Mouse5")).toBe(true);
    expect(isMouseKey("F9")).toBe(false);
  });

  it("says Unsupported for a key it cannot match, not for a known one", () => {
    expect(unsupportedKey("IntlBackslash")).toBe(true);
    expect(unsupportedKey("Numpad7")).toBe(true);
    expect(unsupportedKey("Home")).toBe(false);
  });

  it("allows Escape and single plain keys as the cancel key, not modifiers or mouse buttons", () => {
    expect(validCancelKey("Escape")).toBe(true);
    expect(validCancelKey("F10")).toBe(true);
    expect(validCancelKey("ControlLeft")).toBe(false);
    expect(validCancelKey("Mouse3")).toBe(false);
    expect(validCancelKey("Banana")).toBe(false);
    expect(cancelVk("Escape")).toBe(0x1b);
    expect(cancelVk("F10")).toBe(0x79);
  });
});

describe("conflicts", () => {
  const all = { dictation: "ControlRight", second: "", mouse: "", raw: "AltRight", pasteLast: "ControlLeft+AltLeft+KeyV", cancel: "Escape", "read-selection": "Ctrl+Alt+S" };

  it("finds the slot that already has the shortcut", () => {
    expect(findConflict(all, "pasteLast", "ControlRight")).toBe("dictation");
    expect(findConflict(all, "second", "AltRight")).toBe("raw");
    expect(findConflict(all, "second", "F9")).toBeUndefined();
  });

  it("treats an empty shortcut as no conflict", () => {
    expect(findConflict(all, "second", "")).toBeUndefined();
  });

  it("clashes with a reader accelerator whatever side the modifiers are on", () => {
    expect(findConflict(all, "second", "ControlLeft+AltLeft+KeyS")).toBe("read-selection");
    expect(findConflict(all, "raw", "ControlLeft+AltRight+KeyS")).toBe("read-selection");
  });

  it("clashes when one chord is part of the other on the same sides", () => {
    expect(findConflict(all, "second", "ControlRight+F9")).toBe("dictation");
    expect(findConflict(all, "second", "ControlLeft+AltLeft+KeyV+F9")).toBe("pasteLast");
    expect(findConflict(all, "second", "ControlLeft+F9")).toBeUndefined();
  });

  it("keeps the cancel key out of every chord", () => {
    expect(findConflict(all, "cancel", "AltRight")).toBe("raw");
    expect(findConflict(all, "second", "ControlLeft+Escape")).toBe("cancel");
    expect(findConflict(all, "cancel", "F8")).toBeUndefined();
  });

  it("ignores the slot being changed and finds the first clash in a stored set", () => {
    expect(findConflict(all, "dictation", "ControlRight")).toBeUndefined();
    expect(firstClash(all)).toBeUndefined();
    expect(firstClash({ dictation: "F9", raw: "F9" })).toEqual(["dictation", "raw"]);
  });
});

describe("recorder model", () => {
  const plain = { altGraph: false };

  it("turns held keys into a shortcut", () => {
    expect(interpretKeys(["ControlLeft", "AltLeft", "KeyD"], plain)).toEqual({ ok: true, hotkey: "ControlLeft+AltLeft+KeyD", advanced: false });
    expect(interpretKeys(["AltRight"], plain)).toEqual({ ok: true, hotkey: "AltRight", advanced: false });
    expect(interpretKeys(["MetaLeft"], plain)).toMatchObject({ ok: true, hotkey: "MetaLeft" });
  });

  it("flags Home and the other navigation keys as advanced", () => {
    expect(interpretKeys(["End"], plain)).toEqual({ ok: true, hotkey: "End", advanced: true });
  });

  it("says Unsupported key for a key it cannot match", () => {
    expect(interpretKeys(["IntlBackslash"], plain)).toEqual({ ok: false, refusal: "unsupported" });
    expect(interpretKeys(["ControlLeft", "Numpad1"], plain)).toEqual({ ok: false, refusal: "unsupported" });
  });

  it("refuses Right Alt on its own on an AltGr layout, but not on others or with another key", () => {
    expect(interpretKeys(["AltRight"], { altGraph: true })).toEqual({ ok: false, refusal: "altgr" });
    expect(interpretKeys(["ControlLeft", "AltRight"], { altGraph: true })).toEqual({ ok: false, refusal: "altgr" });
    expect(interpretKeys(["AltRight"], plain)).toMatchObject({ ok: true });
    expect(interpretKeys(["AltRight", "F9"], { altGraph: true })).toMatchObject({ ok: true });
  });

  it("needs a modifier or a stand-alone key, and at most three keys", () => {
    expect(interpretKeys(["KeyA"], plain)).toEqual({ ok: false, refusal: "needs-key" });
    expect(interpretKeys(["ControlLeft", "AltLeft", "ShiftLeft", "KeyD"], plain)).toEqual({ ok: false, refusal: "too-many" });
    expect(interpretKeys([], plain)).toEqual({ ok: false, refusal: "needs-key" });
  });

  it("maps mouse buttons, and refuses the left one", () => {
    expect(interpretButton(0)).toEqual({ ok: false, refusal: "left-click" });
    expect(interpretButton(2)).toEqual({ ok: true, key: "Mouse2" });
    expect(interpretButton(1)).toEqual({ ok: true, key: "Mouse3" });
    expect(interpretButton(3)).toEqual({ ok: true, key: "Mouse4" });
    expect(interpretButton(4)).toEqual({ ok: true, key: "Mouse5" });
    expect(interpretButton(7)).toEqual({ ok: false, refusal: "unsupported" });
  });
});

describe("activation config", () => {
  it("loads a file from before these settings existed with their defaults, keeping the old mode", () => {
    const c = parseConfig({ dictation: { enabled: true, hotkey: "F9", mode: "toggle" } }).dictation;
    expect(c).toMatchObject({ enabled: true, hotkey: "F9", mode: "toggle", holdMs: 300, secondHotkey: "", rawHotkey: "", mouseButton: "", pasteLastHotkey: "ControlLeft+AltLeft+KeyV", cancelKey: "Escape", shareHotkey: false });
  });

  it("keeps every new mode and falls back from an unknown one", () => {
    for (const mode of ["hold", "hold-only", "toggle", "double-tap", "tap-or-hold"]) expect(parseConfig({ dictation: { mode } }).dictation.mode).toBe(mode);
    expect(parseConfig({ dictation: { mode: "hybrid" } }).dictation.mode).toBe("hold");
  });

  it("resets a saved left button to the default and says so", () => {
    const c = parseConfig({ dictation: { hotkey: "Mouse1", mouseButton: "Mouse1", secondHotkey: "ControlLeft+Mouse1" } }).dictation;
    expect(c).toMatchObject({ hotkey: "ControlRight", mouseButton: "", secondHotkey: "", resetNotice: "left-click" });
  });

  it("clears an optional shortcut that shares a key with the dictation shortcut, and says so", () => {
    const c = parseConfig({ dictation: { hotkey: "ControlRight", rawHotkey: "ControlRight" } }).dictation;
    expect(c).toMatchObject({ hotkey: "ControlRight", rawHotkey: "", resetNotice: "clash" });
  });

  it("puts the paste-last default back when it clashes with the dictation shortcut", () => {
    const c = parseConfig({ dictation: { pasteLastHotkey: "F9", hotkey: "F9" } }).dictation;
    expect(c.hotkey).toBe("F9");
    expect(c.pasteLastHotkey).toBe("ControlLeft+AltLeft+KeyV");
  });

  it("keeps a stored hold time only from the list and drops a bad app list but keeps the other pause rules", () => {
    expect(parseConfig({ dictation: { holdMs: 500 } }).dictation.holdMs).toBe(500);
    expect(parseConfig({ dictation: { holdMs: 42 } }).dictation.holdMs).toBe(300);
    expect(parseConfig({ dictation: { pauseRules: { mode: "block", apps: ["game.exe", 5], fullscreen: true } } }).dictation.pauseRules).toEqual({ mode: "block", apps: [], fullscreen: true });
    expect(parseConfig({ dictation: { pauseRules: { mode: "block", apps: ["game.exe"], fullscreen: true } } }).dictation.pauseRules).toEqual({ mode: "block", apps: ["game.exe"], fullscreen: true });
  });

  it("the patch accepts a cleared optional shortcut and refuses an invalid one", () => {
    expect(v.safeParse(DictationPatchSchema, { rawHotkey: "" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { rawHotkey: "KeyA" }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { mouseButton: "Mouse1" }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { mouseButton: "Mouse4" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { cancelKey: "ControlLeft" }).success).toBe(false);
  });
});
