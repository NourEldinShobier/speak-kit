import { describe, expect, it } from "vite-plus/test";
import type { KeyEvent } from "@speakkit/dictation";
import { parseConfig } from "../../shared/schemas";
import { createHotkeys, type HotkeyLayout } from "./hotkey-source";
import { errorView, hudViewFor } from "./hud-view";
import { pausedFor } from "./pause-rules";
import { coreSettings, hotkeyLayout } from "./service-support";
import { VK, type Chord, type HotkeyHandlers, type HotkeySource } from "./types";

const LAYOUT: HotkeyLayout = { hotkey: "ControlRight", second: "", mouse: "", raw: "", pasteLast: "", cancelKey: "Escape", share: false };

function rig(down = new Set<number>()) {
  let handlers: HotkeyHandlers | undefined;
  let chord: Chord | undefined;
  let extras: Record<string, Chord> = {};
  let starts = 0;
  const os: HotkeySource = {
    get active() {
      return !!handlers;
    },
    start(c, h) {
      starts++;
      chord = c;
      handlers = h;
      return { ok: true };
    },
    stop() {
      handlers = undefined;
    },
    grab() {},
    resync() {},
    setExtraChords: (c) => void (extras = { ...c }),
    anyKeyDown: () => down.size > 0,
  };
  const timers: (() => void)[] = [];
  const events: KeyEvent[] = [];
  let changes = 0;
  const hk = createHotkeys({ os, now: () => 5, changed: () => void changes++, after: (_ms, fn) => (timers.push(fn), () => undefined) });
  void hk.subscribe((e) => (events.push(e), true));
  return {
    hk,
    down,
    events,
    starts: () => starts,
    chord: () => chord,
    extras: () => extras,
    push: (e: Parameters<HotkeyHandlers["onEvent"]>[0]) => handlers?.onEvent(e),
    fireTimer: () => timers.splice(0).forEach((f) => f()),
    changes: () => changes,
  };
}

describe("several shortcuts through the source", () => {
  it("registers nothing for an unset shortcut", () => {
    const r = rig();
    r.hk.layout(LAYOUT);
    r.hk.enable(true);
    expect(r.extras()).toEqual({});
  });

  it("registers the second, mouse, raw and paste last chords once they are set, with the mouse code", () => {
    const r = rig();
    r.hk.layout({ ...LAYOUT, second: "ControlLeft+KeyD", mouse: "Mouse4", raw: "AltRight", pasteLast: "ControlLeft+AltLeft+KeyV" });
    r.hk.enable(true);
    expect(r.extras()).toEqual({
      second: { keys: [VK.leftCtrl, 0x44] },
      mouse: { keys: [0x05] },
      raw: { keys: [VK.rightAlt] },
      pasteLast: { keys: [VK.leftCtrl, VK.leftAlt, 0x56] },
    });
  });

  it("names each chord after its own shortcut, so the core can tell which one started a recording", () => {
    const r = rig();
    r.hk.layout({ ...LAYOUT, second: "F8", mouse: "Mouse5", raw: "F7" });
    r.hk.enable(true);
    r.push({ kind: "down", chord: "second" });
    r.push({ kind: "up", chord: "second" });
    r.push({ kind: "down", chord: "mouse" });
    r.push({ kind: "down", chord: "raw" });
    r.push({ kind: "down" });
    expect(r.events.map((e) => `${e.key}:${e.down}`)).toEqual(["F8:true", "F8:false", "Mouse5:true", "F7:true", "ControlRight:true"]);
  });

  it("calls the paste-last handler on press only, and never reports it as a dictation key", () => {
    const r = rig();
    let calls = 0;
    r.hk.onPasteLast(() => void calls++);
    r.hk.layout({ ...LAYOUT, pasteLast: "ControlLeft+AltLeft+KeyV" });
    r.hk.enable(true);
    r.push({ kind: "down", chord: "pasteLast" });
    r.push({ kind: "up", chord: "pasteLast" });
    expect(calls).toBe(1);
    expect(r.events).toEqual([]);
  });

  it("reports the configured cancel key by its name", () => {
    const r = rig();
    r.hk.layout({ ...LAYOUT, cancelKey: "F10" });
    r.hk.enable(true);
    r.push({ kind: "grabbed", vk: 0x79 });
    expect(r.events[0]).toMatchObject({ key: "F10", down: true });
  });

  it("shares the keys with other programs only when asked", () => {
    const r = rig();
    r.hk.layout({ ...LAYOUT, share: true, second: "F8" });
    r.hk.enable(true);
    expect(r.chord()).toEqual({ keys: [VK.rightCtrl], share: true });
    expect(r.extras().second).toEqual({ keys: [0x77], share: true });
  });

  it("does not take a shortcut that has no dictation key", () => {
    const r = rig();
    r.hk.layout({ ...LAYOUT, hotkey: "" });
    expect(r.hk.enable(true)).toBe(false);
  });
});

describe("pause all shortcuts", () => {
  it("removes the hook at once and puts it back when no key is held", () => {
    const r = rig();
    r.hk.layout(LAYOUT);
    r.hk.enable(true);
    expect(r.hk.active).toBe(true);
    r.hk.pause(true);
    expect(r.hk.paused).toBe(true);
    expect(r.hk.active).toBe(false);
    r.hk.pause(false);
    expect(r.hk.paused).toBe(false);
    expect(r.hk.active).toBe(true);
    expect(r.changes()).toBe(1);
  });

  it("waits for held keys before resuming, so a key held through the pause never counts as a press", () => {
    const r = rig(new Set([VK.rightCtrl]));
    r.hk.layout(LAYOUT);
    r.hk.enable(true);
    r.hk.pause(true);
    r.hk.pause(false);
    expect(r.hk.paused).toBe(true);
    expect(r.hk.active).toBe(false);
    r.fireTimer();
    expect(r.hk.paused).toBe(true);
    r.down.clear();
    r.fireTimer();
    expect(r.hk.paused).toBe(false);
    expect(r.hk.active).toBe(true);
  });

  it("a second pause while waiting to resume keeps it paused", () => {
    const r = rig(new Set([A_KEY]));
    r.hk.layout(LAYOUT);
    r.hk.enable(true);
    r.hk.pause(true);
    r.hk.pause(false);
    r.hk.pause(true);
    r.down.clear();
    r.fireTimer();
    expect(r.hk.paused).toBe(true);
    expect(r.hk.active).toBe(false);
  });

  it("layout changes and enabling while paused install nothing", () => {
    const r = rig();
    r.hk.layout(LAYOUT);
    r.hk.enable(true);
    r.hk.pause(true);
    const before = r.starts();
    r.hk.layout({ ...LAYOUT, hotkey: "F9" });
    r.hk.enable(true);
    expect(r.starts()).toBe(before);
    r.hk.pause(false);
    expect(r.chord()).toEqual({ keys: [0x78] });
  });

  it("starts unpaused", () => {
    expect(rig().hk.paused).toBe(false);
  });

  it("resuming when not paused does nothing", () => {
    const r = rig();
    r.hk.layout(LAYOUT);
    r.hk.enable(true);
    const before = r.starts();
    r.hk.pause(false);
    expect(r.starts()).toBe(before);
  });
});

const A_KEY = 0x41;

describe("pause rules", () => {
  const rules = (over: Partial<Parameters<typeof pausedFor>[0]>) => ({ mode: "off" as const, apps: [], fullscreen: false, ...over });

  it("never pauses with the rules off", () => {
    expect(pausedFor(rules({}), { exe: "game.exe", fullscreen: true })).toBe(false);
  });

  it("pauses in a blocked program, whatever the case or the .exe", () => {
    const r = rules({ mode: "block", apps: ["Game.EXE"] });
    expect(pausedFor(r, { exe: "game.exe", fullscreen: false })).toBe(true);
    expect(pausedFor(r, { exe: "notepad.exe", fullscreen: false })).toBe(false);
  });

  it("pauses everywhere except the allowed programs, but not when the program is unknown or the list is empty", () => {
    const r = rules({ mode: "allow", apps: ["notepad"] });
    expect(pausedFor(r, { exe: "notepad.exe", fullscreen: false })).toBe(false);
    expect(pausedFor(r, { exe: "game.exe", fullscreen: false })).toBe(true);
    expect(pausedFor(r, { exe: null, fullscreen: false })).toBe(false);
    expect(pausedFor(rules({ mode: "allow" }), { exe: "game.exe", fullscreen: false })).toBe(false);
  });

  it("pauses in a full-screen program when asked, independently of the list", () => {
    expect(pausedFor(rules({ fullscreen: true }), { exe: "game.exe", fullscreen: true })).toBe(true);
    expect(pausedFor(rules({ fullscreen: true }), { exe: "game.exe", fullscreen: false })).toBe(false);
    expect(pausedFor(rules({ fullscreen: false }), { exe: "game.exe", fullscreen: true })).toBe(false);
  });

  it("does nothing when there is no foreground window", () => {
    expect(pausedFor(rules({ fullscreen: true, mode: "block", apps: ["a"] }), null)).toBe(false);
  });
});

describe("settings to the hook and the core", () => {
  const cfg = (d: object) => parseConfig({ dictation: d }).dictation;

  it("passes every shortcut and the hold time to the core", () => {
    expect(coreSettings(cfg({ hotkey: "F9", mode: "tap-or-hold", holdMs: 500, secondHotkey: "F8", mouseButton: "Mouse4", rawHotkey: "F7", cancelKey: "F10" }))).toMatchObject({
      hotkey: "F9",
      mode: "tap-or-hold",
      holdMs: 500,
      secondKey: "F8",
      mouseKey: "Mouse4",
      rawKey: "F7",
      cancelKey: "F10",
    });
  });

  it("shares the keys only in Hold mode, never in a hands-free mode", () => {
    expect(hotkeyLayout(cfg({ shareHotkey: true, mode: "hold-only" })).share).toBe(true);
    for (const mode of ["hold", "toggle", "double-tap", "tap-or-hold"]) expect(hotkeyLayout(cfg({ shareHotkey: true, mode })).share).toBe(false);
    expect(hotkeyLayout(cfg({ shareHotkey: false, mode: "hold-only" })).share).toBe(false);
  });
});

describe("pills for activation", () => {
  it("names the feature that holds the microphone", () => {
    expect(errorView("mic-in-use", false, "Voice chat")).toMatchObject({ kind: "error", text: "Voice chat is using the microphone" });
    expect(errorView("mic-in-use", false)).toMatchObject({ text: "Another feature is using the microphone" });
    expect(hudViewFor({ state: { status: "error", code: "mic-in-use", owner: "Screen look" }, hotkey: "F9", startedAt: 0, level: 0, insertedAsCopy: false, canRetry: false })).toMatchObject({
      text: "Screen look is using the microphone",
    });
  });

  it("shows the cancel key while a toggled recording runs, and not in a held or locked one", () => {
    const base = { hotkey: "F9", startedAt: 0, level: 0, insertedAsCopy: false, canRetry: false, cancelLabel: "Esc" };
    expect(hudViewFor({ ...base, state: { status: "recording", mode: "toggle" } })).toMatchObject({ cancel: "Esc" });
    expect(hudViewFor({ ...base, state: { status: "recording", mode: "hold" } })).not.toHaveProperty("cancel");
    expect(hudViewFor({ ...base, state: { status: "locked" } })).not.toHaveProperty("cancel");
  });

  it("offers Undo after a cancel that can be undone", () => {
    const base = { hotkey: "F9", startedAt: 0, level: 0, insertedAsCopy: false, canRetry: false };
    expect(hudViewFor({ ...base, state: { status: "idle", notice: { kind: "cancelled", undoable: true } } })).toEqual({
      kind: "notice",
      text: "Cancelled",
      action: { label: "Undo", id: "undo-cancel" },
    });
    expect(hudViewFor({ ...base, state: { status: "idle", notice: { kind: "cancelled" } } })).toEqual({ kind: "notice", text: "Cancelled" });
  });
});
