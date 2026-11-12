import { describe, expect, it } from "vite-plus/test";
import { applyChange, importSettings, type ChangeTargets } from "./settings-change";

function rig(rejected?: { slot: "dictation"; with: "pasteLast" }) {
  const calls: [string, unknown][] = [];
  const targets: ChangeTargets = {
    patchDictation: async (p) => {
      calls.push(["dictation", p]);
      return rejected as never;
    },
    patchApp: async (p) => void calls.push(["app", p]),
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

describe("importSettings", () => {
  const src = (text: string | Error | null) => ({
    pick: async () => (text === null ? null : "settings.json"),
    read: async () => {
      if (text instanceof Error) throw text;
      return text ?? "";
    },
  });

  it("does nothing when the dialog is cancelled", async () => {
    const { calls, targets } = rig();
    expect(await importSettings(src(null), targets)).toEqual({ status: "cancelled" });
    expect(calls).toEqual([]);
  });

  it("applies the valid settings and names the ones left out", async () => {
    const { calls, targets } = rig();
    const text = JSON.stringify({ voice: "af_bella", speed: 99, setupDone: true, dictation: { mode: "toggle" } });
    expect(await importSettings(src(text), targets)).toEqual({ status: "imported", applied: 2, skipped: ["speed", "setupDone"] });
    expect(calls).toEqual([
      ["dictation", { mode: "toggle" }],
      ["app", { voice: "af_bella" }],
    ]);
  });

  it("reports a file that cannot be read, is not JSON or has nothing to import", async () => {
    const { calls, targets } = rig();
    expect(await importSettings(src(new Error("EACCES")), targets)).toEqual({ status: "failed", message: "the file could not be read." });
    expect(await importSettings(src("{"), targets)).toEqual({ status: "failed", message: "the file is not valid JSON." });
    expect(await importSettings(src("{}"), targets)).toEqual({ status: "failed", message: "the file has no settings that can be imported." });
    expect(calls).toEqual([]);
  });

  it("reports a shortcut that clashes", async () => {
    const { targets } = rig({ slot: "dictation", with: "pasteLast" });
    const r = await importSettings(src('{"dictation":{"hotkey":"ControlLeft+AltLeft+KeyT"}}'), targets);
    expect(r).toEqual({ status: "failed", message: "That shortcut is already used by Paste last dictation." });
  });
});
