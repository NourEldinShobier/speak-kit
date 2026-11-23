import { describe, expect, it } from "vite-plus/test";
import { applyChange, type ChangeTargets } from "./settings-change";

function rig(rejected?: { slot: "dictation"; with: "pasteLast" }, clash = false) {
  const calls: [string, unknown][] = [];
  const targets: ChangeTargets = {
    patchDictation: async (p) => {
      calls.push(["dictation", p]);
      return rejected as never;
    },
    patchApp: async (p) => void calls.push(["app", p]),
    patchArea: async (area, p) => void calls.push([area, p]),
    setShortcut: async (id, a) => {
      calls.push(["shortcut", [id, a]]);
      return clash ? { ok: false, error: { code: "unexpected", args: { detail: "x" } } } : { ok: true };
    },
    resetShortcuts: async () => void calls.push(["resetShortcuts", null]),
    setLaunchAtLogin: async (on) => void calls.push(["login", on]),
    setVoiceChatVoice: (voice) => void calls.push(["voiceChat", voice]),
  };
  return { calls, targets };
}

describe("applyChange", () => {
  it("stores dictation settings first, then app settings", async () => {
    const { calls, targets } = rig();
    expect(await applyChange(targets, { voice: "af_bella", "dictation.mode": "toggle" })).toEqual({ ok: true });
    expect(calls).toEqual([
      ["dictation", { mode: "toggle" }],
      ["app", { voice: "af_bella" }],
    ]);
  });

  it("calls only the side that has settings", async () => {
    const { calls, targets } = rig();
    await applyChange(targets, { speed: 1.25 });
    expect(calls).toEqual([["app", { speed: 1.25 }]]);
  });

  it("puts every shortcut back before it sets the ones named beside it", async () => {
    const { calls, targets } = rig();
    expect(await applyChange(targets, { shortcuts: "default", "shortcuts.play-pause": "Ctrl+Alt+Q" })).toEqual({ ok: true });
    expect(calls).toEqual([
      ["resetShortcuts", null],
      ["shortcut", ["play-pause", "Ctrl+Alt+Q"]],
    ]);
  });

  it("refuses anything but default for all shortcuts", async () => {
    const { calls, targets } = rig();
    expect(await applyChange(targets, { shortcuts: "Ctrl+Q" })).toEqual({ ok: false, message: 'shortcuts: only "default" is accepted.' });
    expect(calls).toEqual([]);
  });

  it("refuses a value the page would refuse and stores nothing", async () => {
    const { calls, targets } = rig();
    expect(await applyChange(targets, { speed: 9, voice: "a" })).toEqual({ ok: false, message: "speed: Invalid value: Expected <=3 but received 9" });
    expect(calls).toEqual([]);
  });

  it("refuses an unknown setting", async () => {
    const { calls, targets } = rig();
    const r = await applyChange(targets, { colour: "red" });
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("stores no app setting when a shortcut is refused, and names the clash", async () => {
    const { calls, targets } = rig({ slot: "dictation", with: "pasteLast" });
    const r = await applyChange(targets, { voice: "a", "dictation.hotkey": "ControlLeft+AltLeft+KeyT" });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ message: expect.stringMatching(/^That shortcut is already used by .+\.$/) });
    expect(calls.map((c) => c[0])).toEqual(["dictation"]);
  });
});

describe("applyChange beyond app settings", () => {
  it("sets a shortcut and the login item", async () => {
    const { calls, targets } = rig();
    expect(await applyChange(targets, { "shortcuts.read-selection": "Ctrl+Alt+S", launchAtLogin: true })).toEqual({ ok: true });
    expect(calls).toEqual([
      ["shortcut", ["read-selection", "Ctrl+Alt+S"]],
      ["login", true],
    ]);
  });

  it("hands back the refusal of a shortcut and stores nothing after it", async () => {
    const { calls, targets } = rig(undefined, true);
    const r = await applyChange(targets, { "shortcuts.read-selection": "Ctrl+Alt+S", voice: "a" });
    expect(r).toMatchObject({ ok: false, message: "That shortcut cannot be used.", shortcut: { ok: false } });
    expect(calls.map((c) => c[0])).toEqual(["shortcut"]);
  });

  it("refuses an unknown shortcut, the removed port setting and an area setting it does not know", async () => {
    const { calls, targets } = rig();
    expect((await applyChange(targets, { "shortcuts.nothing": "Ctrl+Alt+S" })).ok).toBe(false);
    expect((await applyChange(targets, { port: 47700 })).ok).toBe(false);
    expect((await applyChange(targets, { "nothing.x": 1 })).ok).toBe(false);
    expect((await applyChange(targets, { "nothing.__proto__": {} })).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
