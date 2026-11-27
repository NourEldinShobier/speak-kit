import { describe, expect, it } from "vite-plus/test";
import type { KeyEvent } from "@speakkit/dictation";
import { createHotkeys, type HotkeyLayout } from "./hotkey-source";
import type { ButtonSource } from "./logitech/buttons";
import { VK, type Chord, type HotkeyHandlers, type HotkeySource } from "./types";

const BASE: HotkeyLayout = { hotkey: "", pasteLast: "", learn: "", cancelKey: "Escape" };

/** An OS hook that records what it was asked and lets the test push events. */
function fakeOs() {
  const log: string[] = [];
  let handlers: HotkeyHandlers | undefined;
  let chord: Chord | undefined;
  let grabbed: readonly number[] = [];
  const os: HotkeySource = {
    get active() {
      return !!handlers;
    },
    start(c, h) {
      if (handlers) return { ok: false, reason: "already-running" };
      chord = c;
      handlers = h;
      log.push(`start ${c.keys.join(",")}`);
      return { ok: true };
    },
    stop() {
      if (handlers) log.push("stop");
      handlers = undefined;
    },
    grab(keys) {
      grabbed = keys;
      log.push(`grab ${keys.join(",")}`);
    },
    resync() {},
  };
  // The real hook is already inactive when it reports a fault.
  const fault = (e: unknown) => {
    const h = handlers;
    handlers = undefined;
    h?.onFault?.(e);
  };
  return { os, log, push: (e: Parameters<HotkeyHandlers["onEvent"]>[0]) => handlers?.onEvent(e), chord: () => chord, grabbed: () => grabbed, fault, handlers: () => handlers };
}

const setup = () => {
  const f = fakeOs();
  const events: KeyEvent[] = [];
  const faults: [unknown, boolean][] = [];
  let t = 1000;
  const hk = createHotkeys({ os: f.os, now: () => (t += 10), onFault: (e, recovered) => faults.push([e, recovered]) });
  hk.layout({ ...BASE, hotkey: "ControlLeft+AltLeft+Space" });
  return { ...f, hk, events, faults, later: (ms: number) => (t += ms), subscribe: () => hk.subscribe((e) => (events.push(e), true)) };
};

describe("hotkey source", () => {
  it("installs nothing until it is enabled", async () => {
    const s = setup();
    await s.subscribe();
    expect(s.log).toEqual([]);
    expect(s.hk.active).toBe(false);
  });

  it("hooks the chord when enabled, as virtual-key codes", async () => {
    const s = setup();
    await s.subscribe();
    expect(s.hk.enable(true)).toBe(true);
    expect(s.chord()).toEqual({ keys: [0xa2, 0xa4, 0x20] });
    expect(s.hk.active).toBe(true);
  });

  it("reports the chord as one key named after the whole hotkey, down then up", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.enable(true);
    s.push({ kind: "down" });
    s.push({ kind: "up" });
    expect(s.events).toEqual([
      { key: "ControlLeft+AltLeft+Space", down: true, at: 1010 },
      { key: "ControlLeft+AltLeft+Space", down: false, at: 1020 },
    ]);
  });

  it("reports other keys and the cancel key by name", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.enable(true);
    s.push({ kind: "other", vk: 0x58 });
    s.push({ kind: "other", vk: 0xe7 });
    s.push({ kind: "grabbed", vk: VK.escape });
    expect(s.events.map((e) => [e.key, e.down])).toEqual([
      ["KeyX", true],
      ["Vk231", true],
      ["Escape", true],
    ]);
  });

  it("removes the hook when disabled, and enable(false) is a success", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.enable(true);
    expect(s.hk.enable(false)).toBe(true);
    expect(s.hk.active).toBe(false);
    s.push({ kind: "down" });
    expect(s.events).toEqual([]);
  });

  it("grabs Escape only while asked, also when the hook starts afterwards", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.setCancelGrab(true);
    s.hk.enable(true);
    expect(s.grabbed()).toEqual([VK.escape]);
    s.hk.setCancelGrab(false);
    expect(s.grabbed()).toEqual([]);
  });

  it("takes a new hotkey at once while running, keeping the cancel grab", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.enable(true);
    s.hk.setCancelGrab(true);
    s.hk.layout({ ...BASE, hotkey: "F9" });
    expect(s.chord()).toEqual({ keys: [0x78] });
    expect(s.grabbed()).toEqual([VK.escape]);
    s.push({ kind: "down" });
    expect(s.events[0]!.key).toBe("F9");
  });

  it("cannot enable before dictation subscribed, and unsubscribing removes the hook", async () => {
    const s = setup();
    expect(s.hk.enable(true)).toBe(false);
    const off = await s.subscribe();
    s.hk.enable(true);
    off();
    expect(s.hk.active).toBe(false);
  });

  it("reinstalls a hook that died and says it recovered; the keys work again", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.enable(true);
    const boom = new Error("decode");
    s.fault(boom);
    expect(s.faults).toEqual([[boom, true]]);
    expect(s.hk.active).toBe(true);
    s.push({ kind: "down" });
    expect(s.events).toHaveLength(1);
  });

  it("does not reinstall a hook that dies again within ten seconds, and reports it as not recovered", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.enable(true);
    s.fault(new Error("a"));
    s.later(5000);
    s.fault(new Error("b"));
    expect(s.faults.map(([, recovered]) => recovered)).toEqual([true, false]);
    expect(s.hk.active).toBe(false);
    s.later(11_000);
    s.hk.enable(true);
    s.fault(new Error("c"));
    expect(s.faults.map(([, recovered]) => recovered)).toEqual([true, false, true]);
  });

  it("does not bring a hook back that was switched off", async () => {
    const s = setup();
    await s.subscribe();
    s.hk.enable(true);
    const handlers = s.handlers();
    s.hk.enable(false);
    const late = new Error("late");
    handlers?.onFault?.(late);
    expect(s.faults).toEqual([[late, false]]);
    expect(s.hk.active).toBe(false);
  });

  it("says so when the system refuses the hook", async () => {
    const hk = createHotkeys({ os: { active: false, start: () => ({ ok: false, reason: "hook-failed" }), stop() {}, grab() {}, resync() {} }, now: () => 0 });
    hk.layout({ ...BASE, hotkey: "F9" });
    await hk.subscribe(() => true);
    expect(hk.enable(true)).toBe(false);
  });
});

describe("hotkey source with mouse buttons", () => {
  function mouseSetup(layout: Partial<HotkeyLayout>) {
    const f = fakeOs();
    const assigned: number[][] = [];
    let press: (cid: number, down: boolean) => void = () => undefined;
    const buttons: ButtonSource = {
      assign: (cids) => void assigned.push([...cids]),
      onButton: (cb) => void (press = cb),
      learn: async () => ({ ok: false, reason: "unavailable" }),
      cancelLearn: () => undefined,
      dispose: () => void assigned.push([-1]),
    };
    const events: KeyEvent[] = [];
    const pasted: string[] = [];
    let t = 1000;
    const hk = createHotkeys({ os: f.os, buttons, now: () => (t += 10) });
    hk.onPasteLast(() => pasted.push("paste"));
    hk.onLearn(() => pasted.push("learn"));
    hk.layout({ ...BASE, ...layout });
    return { ...f, hk, events, pasted, assigned, press: (cid: number, down: boolean) => press(cid, down), subscribe: () => hk.subscribe((e) => (events.push(e), true)) };
  }

  it("feeds a mouse button as the dictation key, named by its id, down then up", async () => {
    const s = mouseSetup({ hotkey: "logi:0x00c3" });
    await s.subscribe();
    s.hk.enable(true);
    s.press(0xc3, true);
    s.press(0xc3, false);
    expect(s.events).toEqual([
      { key: "logi:0x00c3", down: true, at: 1010 },
      { key: "logi:0x00c3", down: false, at: 1020 },
    ]);
  });

  it("hooks no keys for a mouse button shortcut and asks for the button to be diverted only while enabled", async () => {
    const s = mouseSetup({ hotkey: "logi:0x00c3", pasteLast: "logi:0x00d7", learn: "ControlLeft+KeyL" });
    await s.subscribe();
    expect(s.assigned).toEqual([]);
    s.hk.enable(true);
    expect(s.chord()).toEqual({ keys: [] });
    expect(s.assigned.at(-1)).toEqual([0xc3, 0xd7]);
    s.hk.pause(true);
    expect(s.assigned.at(-1)).toEqual([]);
    s.hk.enable(false);
    expect(s.assigned.at(-1)).toEqual([]);
  });

  it("runs Paste last and Learn correction from a mouse button press, not from its release", async () => {
    const s = mouseSetup({ hotkey: "ControlRight", pasteLast: "logi:0x00d7", learn: "logi:0x00c4" });
    await s.subscribe();
    s.hk.enable(true);
    s.press(0xd7, true);
    s.press(0xd7, false);
    s.press(0xc4, true);
    s.press(0x52, true);
    expect(s.pasted).toEqual(["paste", "learn"]);
    expect(s.events).toEqual([]);
  });

  it("reports a held mouse button as released when the shortcuts are paused", async () => {
    const s = mouseSetup({ hotkey: "logi:0x00c3" });
    await s.subscribe();
    s.hk.enable(true);
    s.press(0xc3, true);
    s.hk.pause(true);
    expect(s.events.map((e) => [e.key, e.down])).toEqual([
      ["logi:0x00c3", true],
      ["logi:0x00c3", false],
    ]);
    s.press(0xc3, true);
    expect(s.events).toHaveLength(2);
  });

  it("releases the buttons when disposed", async () => {
    const s = mouseSetup({ hotkey: "logi:0x00c3" });
    await s.subscribe();
    s.hk.dispose();
    expect(s.assigned.at(-1)).toEqual([-1]);
  });
});
