import { describe, expect, it } from "vite-plus/test";
import { areaChange } from "../settings/area-change";
import { validateChange } from "./settings-registry";

describe("validateChange beyond app settings", () => {
  it("splits a change by who stores it", () => {
    const r = validateChange({
      voice: "af_bella",
      "dictation.mode": "toggle",
      "capture.target": "area",
      "transcripts.textDays": 90,
      "meetings.stopWhenEnds": false,
      "engines.releaseOnClose": true,
      "shortcuts.stop": "ctrl+alt+s",
      launchAtLogin: true,
      port: 47700,
    });
    expect(r).toEqual({
      ok: true,
      app: { voice: "af_bella" },
      dictation: { mode: "toggle" },
      areas: { capture: { target: "area" }, transcripts: { textDays: 90 }, meetings: { stopWhenEnds: false }, engines: { releaseOnClose: true } },
      shortcuts: { stop: "Ctrl+Alt+S" },
      system: { launchAtLogin: true, port: 47700 },
    });
  });

  it.each([
    [{ "capture.target": "everywhere" }, "capture.target"],
    [{ "capture.nothing": 1 }, "capture."],
    [{ "engines.device": "tpu" }, "engines.device"],
    [{ "shortcuts.nothing": "Ctrl+Alt+S" }, "shortcuts.nothing: not a shortcut."],
    [{ "shortcuts.stop": "S" }, "shortcuts.stop: not a usable shortcut."],
    [{ "shortcuts.stop": 5 }, "shortcuts.stop: not a usable shortcut."],
    [{ port: 80 }, "port"],
    [{ launchAtLogin: "yes" }, "launchAtLogin"],
    [{ "capture.__proto__": {} }, "capture.__proto__ is not a setting."],
    [{ "constructor.x": 1 }, "constructor.x"],
  ])("refuses %j", (change, text) => {
    const r = validateChange(change);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain(text);
  });

  it("lets the command line change only what it lists", () => {
    expect(validateChange({ "capture.target": "area" }, ["voice"])).toEqual({ ok: false, message: "capture.target cannot be changed from the command line." });
    expect(validateChange({ port: 47700 }, ["voice"]).ok).toBe(false);
  });

  it("restores voiceChatVoice", () => {
    expect(validateChange({ voiceChatVoice: "alloy" })).toMatchObject({ ok: true, system: { voiceChatVoice: "alloy" } });
  });
});

describe("areaChange", () => {
  it("names each key under its area", () => {
    expect(areaChange("capture", { hotkey: "F9", narration: true })).toEqual({ "capture.hotkey": "F9", "capture.narration": true });
  });
});
