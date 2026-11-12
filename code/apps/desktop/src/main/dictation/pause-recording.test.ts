import { describe, expect, it } from "vite-plus/test";
import type { Dictation, KeyEvent } from "@speakkit/dictation";
import { createHotkeys, type HotkeyLayout, type SwitchableHotkeys } from "./hotkey-source";
import { ShortcutControls } from "./shortcut-controls";
import type { HotkeyHandlers, HotkeySource } from "./types";

const LAYOUT: HotkeyLayout = { hotkey: "ControlLeft+AltLeft+Space", second: "ControlRight", mouse: "", raw: "", pasteLast: "", transform: "", cancelKey: "Escape", share: false };

function rig() {
  let handlers: HotkeyHandlers | undefined;
  const os: HotkeySource = {
    get active() {
      return !!handlers;
    },
    start: (_c, h) => ((handlers = h), { ok: true }),
    stop: () => (handlers = undefined),
    grab() {},
    resync() {},
  };
  const events: KeyEvent[] = [];
  const hk = createHotkeys({ os, now: () => 1 });
  hk.layout(LAYOUT);
  return { hk, events, push: (e: Parameters<HotkeyHandlers["onEvent"]>[0]) => handlers?.onEvent(e), subscribe: () => hk.subscribe((e) => (events.push(e), true)), active: () => !!handlers };
}

describe("pausing shortcuts during a recording", () => {
  it("reports the release of every held shortcut once, then removes the hook", async () => {
    const r = rig();
    await r.subscribe();
    r.hk.enable(true);
    r.push({ kind: "down" });
    r.push({ kind: "down", chord: "second" });
    r.push({ kind: "up", chord: "second" });
    r.events.length = 0;
    r.hk.pause(true);
    expect(r.events.map((e) => [e.key, e.down])).toEqual([["ControlLeft+AltLeft+Space", false]]);
    expect(r.active()).toBe(false);
    r.hk.pause(true);
    expect(r.events).toHaveLength(1);
  });

  it("reports nothing when no shortcut is held", async () => {
    const r = rig();
    await r.subscribe();
    r.hk.enable(true);
    r.push({ kind: "down" });
    r.push({ kind: "up" });
    r.events.length = 0;
    r.hk.pause(true);
    expect(r.events).toEqual([]);
  });

  it("cancels the recording before the hook goes, for a manual pause and for a pause rule", () => {
    const log: string[] = [];
    const core = { cancel: () => log.push("cancel") } as unknown as Dictation;
    const hotkeys = { pause: (on: boolean) => log.push(`pause ${on}`) } as unknown as SwitchableHotkeys;
    const c = new ShortcutControls({ hotkeys: () => hotkeys, core: () => core, presenter: {} as never, foreground: () => null, rules: () => undefined, changed: () => log.push("changed") });
    c.setPaused(true);
    expect(log).toEqual(["cancel", "pause true", "changed"]);
    log.length = 0;
    c.setPaused(false);
    expect(log).toEqual(["pause false", "changed"]);
  });
});
