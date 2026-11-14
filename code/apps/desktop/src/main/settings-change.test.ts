import { describe, expect, it } from "vite-plus/test";
import { applyChange, importSettings, type ChangeTargets } from "./settings-change";

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
    setPort: async (n) => {
      if (n === 47616) throw new Error("Port 47616 is busy.");
      calls.push(["port", n]);
    },
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
    expect(await applyChange(targets, { shortcuts: "default", "shortcuts.stop": "Ctrl+Alt+Q" })).toEqual({ ok: true });
    expect(calls).toEqual([
      ["resetShortcuts", null],
      ["shortcut", ["stop", "Ctrl+Alt+Q"]],
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

describe("importSettings", () => {
  const asked: string[][] = [];
  const src = (text: string | Error | null, current: Record<string, unknown> = {}, allow = false) => ({
    pick: async () => (text === null ? null : "settings.json"),
    read: async () => {
      if (text instanceof Error) throw text;
      return text ?? "";
    },
    current: () => current,
    confirm: async (what: string[]) => {
      asked.push(what);
      return allow;
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
    expect(await importSettings(src(text), targets)).toEqual({ status: "imported", applied: 2, changed: ["voice", "dictation.mode"], skipped: ["speed", "setupDone"] });
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

  it("restores every feature area of the file the app wrote", async () => {
    const { calls, targets } = rig();
    const file = {
      voice: "af_bella",
      voiceChatVoice: "alloy",
      shortcuts: { stop: "Ctrl+Alt+S" },
      capture: { target: "area", retentionDays: 30, consented: true, folder: "C:/other", narrationCommand: "calc.exe" },
      transcripts: { textDays: 90 },
      meetings: { stopWhenEnds: false },
      engines: { releaseOnClose: true, lastUsed: { m: 1 } },
    };
    const r = await importSettings(src(JSON.stringify(file), { voice: "af_bella" }), targets);
    expect(r).toEqual({
      status: "imported",
      applied: 8,
      changed: ["voiceChatVoice", "shortcuts.stop", "capture.target", "capture.retentionDays", "transcripts.textDays", "meetings.stopWhenEnds", "engines.releaseOnClose"],
      skipped: ["capture.consented", "capture.folder", "capture.narrationCommand", "engines.lastUsed"],
    });
    expect(calls).toEqual([
      ["shortcut", ["stop", "Ctrl+Alt+S"]],
      ["app", { voice: "af_bella" }],
      ["capture", { target: "area", retentionDays: 30 }],
      ["transcripts", { textDays: 90 }],
      ["meetings", { stopWhenEnds: false }],
      ["engines", { releaseOnClose: true }],
      ["voiceChat", "alloy"],
    ]);
  });

  it("asks before switching on the control server, experiments and tool access, and says what they are", async () => {
    asked.length = 0;
    const { calls, targets } = rig();
    await importSettings(src('{"controlServer":true,"mcpTools":{"a":true},"voice":"af_bella"}', { controlServer: false }, true), targets);
    expect(asked).toEqual([["the local control server for the command line and AI apps", "the tools offered to AI apps"]]);
    expect(calls).toEqual([["app", { controlServer: true, mcpTools: { a: true }, voice: "af_bella" }]]);
  });

  it("leaves those settings out when the person declines, and applies the rest", async () => {
    const { calls, targets } = rig();
    const r = await importSettings(src('{"controlServer":true,"voice":"af_bella"}', { controlServer: false }, false), targets);
    expect(r).toEqual({ status: "imported", applied: 1, changed: ["voice"], skipped: ["controlServer"] });
    expect(calls).toEqual([["app", { voice: "af_bella" }]]);
  });

  it("does nothing when the person declines and nothing else was in the file", async () => {
    const { calls, targets } = rig();
    expect(await importSettings(src('{"experiments":{"x":true}}', {}, false), targets)).toEqual({ status: "cancelled" });
    expect(calls).toEqual([]);
  });

  it("does not ask when the file holds no such setting", async () => {
    asked.length = 0;
    await importSettings(src('{"voice":"af_bella"}'), rig().targets);
    expect(asked).toEqual([]);
  });
});

describe("applyChange beyond app settings", () => {
  it("sets a shortcut, the login item and the port", async () => {
    const { calls, targets } = rig();
    expect(await applyChange(targets, { "shortcuts.stop": "Ctrl+Alt+S", launchAtLogin: true, port: 47700 })).toEqual({ ok: true });
    expect(calls).toEqual([
      ["shortcut", ["stop", "Ctrl+Alt+S"]],
      ["login", true],
      ["port", 47700],
    ]);
  });

  it("hands back the refusal of a shortcut and stores nothing after it", async () => {
    const { calls, targets } = rig(undefined, true);
    const r = await applyChange(targets, { "shortcuts.stop": "Ctrl+Alt+S", voice: "a" });
    expect(r).toMatchObject({ ok: false, message: "That shortcut cannot be used.", shortcut: { ok: false } });
    expect(calls.map((c) => c[0])).toEqual(["shortcut"]);
  });

  it("answers a port the server cannot use with its message", async () => {
    expect(await applyChange(rig().targets, { port: 47616 })).toEqual({ ok: false, message: "Port 47616 is busy." });
  });

  it("refuses an unknown shortcut, a port outside the range and an area setting it does not know", async () => {
    const { calls, targets } = rig();
    expect((await applyChange(targets, { "shortcuts.nothing": "Ctrl+Alt+S" })).ok).toBe(false);
    expect((await applyChange(targets, { port: 80 })).ok).toBe(false);
    expect((await applyChange(targets, { "capture.nothing": 1 })).ok).toBe(false);
    expect((await applyChange(targets, { "capture.__proto__": {} })).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
