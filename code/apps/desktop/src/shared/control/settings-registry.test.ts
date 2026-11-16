import { describe, expect, it } from "vite-plus/test";
import { areaChange } from "../settings/area-change";
import { checkPickedFolder, validateChange } from "./settings-registry";

describe("validateChange beyond app settings", () => {
  it("splits a change by who stores it", () => {
    const r = validateChange({
      voice: "af_bella",
      "dictation.mode": "toggle",
      "transcripts.textDays": 90,
      "meetings.stopWhenEnds": false,
      "engines.releaseOnClose": true,
      "shortcuts.stop": "ctrl+alt+s",
      launchAtLogin: true,
      port: 47700,
    });
    expect(r).toEqual({
      ok: true,
      resetShortcuts: false,
      app: { voice: "af_bella" },
      dictation: { mode: "toggle" },
      areas: { transcripts: { textDays: 90 }, meetings: { stopWhenEnds: false }, engines: { releaseOnClose: true } },
      shortcuts: { stop: "Ctrl+Alt+S" },
      system: { launchAtLogin: true, port: 47700 },
    });
  });

  it.each([
    [{ "meetings.stopWhenEnds": "maybe" }, "meetings.stopWhenEnds"],
    [{ "meetings.nothing": 1 }, "meetings."],
    [{ "engines.device": "tpu" }, "engines.device"],
    [{ "shortcuts.nothing": "Ctrl+Alt+S" }, "shortcuts.nothing: not a shortcut."],
    [{ "shortcuts.stop": "S" }, "shortcuts.stop: not a usable shortcut."],
    [{ "shortcuts.stop": 5 }, "shortcuts.stop: not a usable shortcut."],
    [{ port: 80 }, "port"],
    [{ launchAtLogin: "yes" }, "launchAtLogin"],
    [{ "meetings.__proto__": {} }, "meetings.__proto__ is not a setting."],
    [{ "constructor.x": 1 }, "constructor.x"],
  ])("refuses %j", (change, text) => {
    const r = validateChange(change);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain(text);
  });

  it("lets the command line change only what it lists", () => {
    expect(validateChange({ "meetings.stopWhenEnds": false }, ["voice"])).toEqual({ ok: false, message: "meetings.stopWhenEnds cannot be changed from the command line." });
    expect(validateChange({ port: 47700 }, ["voice"]).ok).toBe(false);
  });

  it("accepts a chosen folder for transcripts and meetings only from a chooser", () => {
    expect(validateChange({ "transcripts.folder": "D:/Talks" }).ok).toBe(false);
    expect(validateChange({ "meetings.folder": "D:/Calls" }).ok).toBe(false);
    expect(checkPickedFolder("transcripts", "D:/Talks")).toEqual({ ok: true, patch: { folder: "D:/Talks" } });
    expect(checkPickedFolder("meetings", "D:/Calls")).toEqual({ ok: true, patch: { folder: "D:/Calls" } });
  });

  it("restores voiceChatVoice", () => {
    expect(validateChange({ voiceChatVoice: "alloy" })).toMatchObject({ ok: true, system: { voiceChatVoice: "alloy" } });
  });
});

describe("areaChange", () => {
  it("names each key under its area", () => {
    expect(areaChange("meetings", { summary: true, folder: "x" })).toEqual({ "meetings.summary": true, "meetings.folder": "x" });
  });
});
