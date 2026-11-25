import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { ACCELERATOR_SLOTS, findConflict, firstClash, HOOK_SLOTS, SLOT_NAMES } from "./conflicts";
import { cancelVk, hotkeyLabels, KEY_VK, unsupportedKey, usesAdvancedKey, validCancelKey, validHotkey } from "./keys";
import { interpretKeys } from "./recorder-model";
import { DictationPatchSchema } from "./settings";
import * as v from "valibot";

describe("keys added for activation", () => {
  it("accepts Home, End, Page Up and Page Down on their own", () => {
    for (const k of ["Home", "End", "PageUp", "PageDown"]) expect(validHotkey(k)).toBe(true);
  });

  it("refuses a letter on its own and any mouse button", () => {
    expect(validHotkey("KeyA")).toBe(false);
    for (const k of ["Mouse1", "Mouse2", "Mouse3", "Mouse4", "Mouse5", "ControlLeft+Mouse4"]) expect(validHotkey(k)).toBe(false);
  });

  it("maps the dedicated navigation keys to codes the numpad keys can never produce", () => {
    expect(KEY_VK.Home).toBe(0x124);
    expect(KEY_VK.End).toBe(0x123);
    expect(KEY_VK.PageUp).toBe(0x121);
    expect(KEY_VK.PageDown).toBe(0x122);
  });

  it("labels the new keys and tells advanced keys apart", () => {
    expect(hotkeyLabels("PageDown")).toEqual(["Page Down"]);
    expect(usesAdvancedKey("ControlLeft+Home")).toBe(true);
    expect(usesAdvancedKey("F9")).toBe(false);
  });

  it("says Unsupported for a key it cannot match, not for a known one", () => {
    expect(unsupportedKey("IntlBackslash")).toBe(true);
    expect(unsupportedKey("Numpad7")).toBe(true);
    expect(unsupportedKey("Home")).toBe(false);
  });

  it("allows Escape and single plain keys as the cancel key, not modifiers or a mouse button", () => {
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
  const all = { dictation: "ControlRight", pasteLast: "ControlLeft+AltLeft+KeyV", cancel: "Escape", "read-selection": "Ctrl+Alt+S" };

  it("finds the slot that already has the shortcut", () => {
    expect(findConflict(all, "pasteLast", "ControlRight")).toBe("dictation");
    expect(findConflict(all, "dictation", "ControlLeft+AltLeft+KeyV")).toBe("pasteLast");
    expect(findConflict(all, "pasteLast", "F9")).toBeUndefined();
  });

  it("treats an empty shortcut as no conflict", () => {
    expect(findConflict(all, "pasteLast", "")).toBeUndefined();
  });

  it("clashes with a reader accelerator whatever side the modifiers are on", () => {
    expect(findConflict(all, "pasteLast", "ControlLeft+AltLeft+KeyS")).toBe("read-selection");
    expect(findConflict(all, "pasteLast", "ControlLeft+AltRight+KeyS")).toBe("read-selection");
  });

  it("clashes when one chord is part of the other on the same sides", () => {
    expect(findConflict(all, "pasteLast", "ControlRight+F9")).toBe("dictation");
    expect(findConflict(all, "dictation", "ControlLeft+AltLeft+KeyV+F9")).toBe("pasteLast");
    expect(findConflict(all, "pasteLast", "ControlLeft+F9")).toBeUndefined();
  });

  it("keeps the cancel key out of every chord", () => {
    expect(findConflict(all, "cancel", "ControlRight")).toBe("dictation");
    expect(findConflict(all, "pasteLast", "ControlLeft+Escape")).toBe("cancel");
    expect(findConflict(all, "cancel", "F8")).toBeUndefined();
  });

  it("ignores the slot being changed and finds the first clash in a stored set", () => {
    expect(findConflict(all, "dictation", "ControlRight")).toBeUndefined();
    expect(firstClash(all)).toBeUndefined();
    expect(firstClash({ dictation: "F9", pasteLast: "F9" })).toEqual(["dictation", "pasteLast"]);
  });
});

describe("conflict names and accelerators", () => {
  it("names every shortcut the way the page does", () => {
    expect(SLOT_NAMES).toEqual({
      dictation: "Dictation shortcut",
      pasteLast: "Paste last dictation",
      learn: "Learn correction",
      cancel: "Cancel key",
      "read-selection": "Read selection",
      "play-pause": "Play or pause",
    });
    expect([...HOOK_SLOTS, ...ACCELERATOR_SLOTS]).toHaveLength(6);
  });

  it("reads accelerator spellings: Ctrl, Control, Option, Shift, Super, Meta, Win, letters, digits and named keys", () => {
    const base = { "play-pause": "" };
    for (const [accel, chord] of [
      ["Ctrl+Alt+S", "ControlLeft+AltLeft+KeyS"],
      ["control+option+1", "ControlRight+AltRight+Digit1"],
      ["Shift+Super+KeyQ", "ShiftLeft+MetaLeft+KeyQ"],
      ["Meta+Shift+F9", "MetaRight+ShiftRight+F9"],
      ["Win+Ctrl+Space", "MetaLeft+ControlLeft+Space"],
    ] as const) {
      expect(findConflict({ ...base, "read-selection": accel }, "pasteLast", chord)).toBe("read-selection");
    }
    expect(findConflict({ "read-selection": "Ctrl+Alt+S" }, "pasteLast", "ControlLeft+AltLeft+KeyD")).toBeUndefined();
    expect(findConflict({ "read-selection": "Ctrl+Alt+1" }, "pasteLast", "ControlLeft+AltLeft+KeyD")).toBeUndefined();
  });

  it("does not clash an accelerator with another accelerator slot unless the keys are the same set", () => {
    expect(findConflict({ "read-selection": "Ctrl+Alt+X" }, "play-pause", "Alt+Ctrl+X")).toBe("read-selection");
    expect(findConflict({ "read-selection": "Ctrl+Alt+X" }, "play-pause", "Ctrl+Alt+Y")).toBeUndefined();
    expect(findConflict({ "read-selection": "Ctrl+Alt+X" }, "play-pause", "Ctrl+Alt+X+Y")).toBeUndefined();
  });

  it("the cancel key clashes with a chord that contains it and with nothing else", () => {
    expect(findConflict({ pasteLast: "ControlLeft+Pause" }, "cancel", "Pause")).toBe("pasteLast");
    expect(findConflict({ pasteLast: "ControlLeft+Pause" }, "cancel", "F5")).toBeUndefined();
    expect(findConflict({ cancel: "F5" }, "pasteLast", "ControlLeft+F5")).toBe("cancel");
  });

  it("two chords clash when one is inside the other on the same sides, not when the sides differ", () => {
    expect(findConflict({ dictation: "ControlLeft+AltLeft+Space" }, "pasteLast", "ControlLeft+AltLeft")).toBe("dictation");
    expect(findConflict({ dictation: "ControlLeft+AltLeft+Space" }, "pasteLast", "ControlRight+AltLeft")).toBeUndefined();
    expect(findConflict({ dictation: "F9" }, "pasteLast", "ControlLeft+AltLeft+F9")).toBe("dictation");
  });

  it("firstClash returns the pair in the order of the stored slots", () => {
    expect(firstClash({ dictation: "F9", pasteLast: "F8", cancel: "F8" })).toEqual(["pasteLast", "cancel"]);
    expect(firstClash({})).toBeUndefined();
    expect(firstClash({ dictation: "", pasteLast: "" })).toBeUndefined();
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
});

describe("activation config", () => {
  it("loads a file from before these settings existed with their defaults, keeping the old mode", () => {
    const c = parseConfig({ dictation: { enabled: true, hotkey: "F9", mode: "toggle" } }).dictation;
    expect(c).toMatchObject({
      enabled: true,
      hotkey: "F9",
      mode: "toggle",
      pasteLastHotkey: "ControlLeft+AltLeft+KeyV",
      cancelKey: "Escape",
    });
  });

  it("keeps every new mode and falls back from an unknown one", () => {
    for (const mode of ["hold", "hold-only", "toggle", "double-tap", "tap-or-hold"]) expect(parseConfig({ dictation: { mode } }).dictation.mode).toBe(mode);
    expect(parseConfig({ dictation: { mode: "hybrid" } }).dictation.mode).toBe("hold");
  });

  describe("a saved shortcut with a mouse button goes back to the default of the platform", () => {
    const realPlatform = process.platform;
    afterEach(() => {
      Object.defineProperty(process, "platform", { value: realPlatform });
      vi.resetModules();
    });
    it.each([
      ["win32", "ControlRight"],
      ["darwin", "AltRight"],
    ] as const)("%s", async (platform, hotkey) => {
      Object.defineProperty(process, "platform", { value: platform });
      vi.resetModules();
      const { parseConfig: parse } = await import("../schemas");
      for (const saved of ["Mouse1", "Mouse4", "ControlLeft+Mouse5"]) {
        const c = parse({ dictation: { hotkey: saved, pasteLastHotkey: saved } }).dictation;
        expect(c).toMatchObject({ hotkey, pasteLastHotkey: "ControlLeft+AltLeft+KeyV" });
        expect(c.resetNotice).toBeUndefined();
      }
    });
  });

  it("loads a file that still has a second shortcut or a mouse button, and drops both", () => {
    const c = parseConfig({ dictation: { hotkey: "F9", secondHotkey: "F8", mouseButton: "Mouse4" } }).dictation;
    expect(c).toMatchObject({ hotkey: "F9" });
    expect(c.resetNotice).toBeUndefined();
    for (const key of ["secondHotkey", "mouseButton"]) expect(c).not.toHaveProperty(key);
  });

  it("puts Escape back when the cancel key shares a key with the dictation shortcut, and says so", () => {
    const c = parseConfig({ dictation: { hotkey: "F9", cancelKey: "F9" } }).dictation;
    expect(c).toMatchObject({ hotkey: "F9", cancelKey: "Escape", resetNotice: "clash" });
  });

  it("puts the paste-last default back when it clashes with the dictation shortcut", () => {
    const c = parseConfig({ dictation: { pasteLastHotkey: "F9", hotkey: "F9" } }).dictation;
    expect(c.hotkey).toBe("F9");
    expect(c.pasteLastHotkey).toBe("ControlLeft+AltLeft+KeyV");
  });

  it("has no learn-correction shortcut until one is set, and clears it when it shares a key", () => {
    expect(parseConfig({ dictation: {} }).dictation.learnHotkey).toBe("");
    expect(parseConfig({ dictation: { learnHotkey: "ControlLeft+AltLeft+KeyL" } }).dictation.learnHotkey).toBe("ControlLeft+AltLeft+KeyL");
    const c = parseConfig({ dictation: { hotkey: "F9", learnHotkey: "F9" } }).dictation;
    expect(c).toMatchObject({ hotkey: "F9", learnHotkey: "", resetNotice: "clash" });
    expect(v.safeParse(DictationPatchSchema, { learnHotkey: "" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { learnHotkey: "ControlLeft+AltLeft+KeyL" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { learnHotkey: "KeyA" }).success).toBe(false);
  });

  it("keeps a learned fix with the neighbours and the dictations it was seen in, at most five, and drops a suggestion that is repeated", () => {
    const learned = (sources: string[]) => ({ heard: "cloud code", count: 2, createdAt: 5, left: "opened", sources });
    const ok = { id: "a", word: "Claude Code", soundsLike: ["cloud code"], app: "slack", suggested: true, learned: learned(["e1", "e2"]) };
    const many = { ...ok, id: "b", word: "Other", learned: learned(["1", "2", "3", "4", "5", "6"]) };
    expect(parseConfig({ dictation: { terms: [ok, many, { ...ok, id: "c" }] } }).dictation.terms).toEqual([ok]);
  });

  it("the patch takes words with a learned fix and refuses repeated ids and more than the cap", () => {
    const row = (id: string) => ({ id, word: `w${id}`, soundsLike: ["a b"], learned: { heard: "a b", count: 1, createdAt: 1 } });
    expect(v.safeParse(DictationPatchSchema, { terms: [row("a"), row("b")] }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { terms: [row("a"), { ...row("b"), id: "a" }] }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { terms: Array.from({ length: 501 }, (_, i) => row(String(i))) }).success).toBe(false);
  });

  it("loads a file that still has the removed sharing, pause and clean-up settings, and drops them", () => {
    const c = parseConfig({ dictation: { shareHotkey: true, pauseRules: { mode: "block", apps: ["game.exe"], fullscreen: true }, transformHotkey: "F6" } }).dictation;
    for (const key of ["shareHotkey", "pauseRules", "transformHotkey"]) expect(c).not.toHaveProperty(key);
  });

  it("the patch accepts a cleared optional shortcut and refuses an invalid one", () => {
    expect(v.safeParse(DictationPatchSchema, { pasteLastHotkey: "" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { pasteLastHotkey: "KeyA" }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { pasteLastHotkey: "Mouse4" }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { cancelKey: "ControlLeft" }).success).toBe(false);
    for (const removed of [{ secondHotkey: "F8" }, { mouseButton: "Mouse4" }, { shareHotkey: true }, { pauseRules: { mode: "off", apps: [], fullscreen: false } }, { transformHotkey: "F6" }])
      expect(v.safeParse(DictationPatchSchema, removed).success).toBe(false);
  });
});
