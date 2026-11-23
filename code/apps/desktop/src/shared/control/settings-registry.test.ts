import { describe, expect, it } from "vite-plus/test";
import { areaChange } from "../settings/area-change";
import { validateChange } from "./settings-registry";

describe("validateChange beyond app settings", () => {
  it("splits a change by who stores it", () => {
    const r = validateChange({
      voice: "af_bella",
      "dictation.mode": "toggle",
      "transcripts.language": "de",
      "engines.idleMinutes": 30,
      "shortcuts.play-pause": "ctrl+alt+x",
      launchAtLogin: true,
    });
    expect(r).toEqual({
      ok: true,
      resetShortcuts: false,
      app: { voice: "af_bella" },
      dictation: { mode: "toggle" },
      areas: { transcripts: { language: "de" }, engines: { idleMinutes: 30 } },
      shortcuts: { "play-pause": "Ctrl+Alt+X" },
      system: { launchAtLogin: true },
    });
  });

  it.each([
    [{ "meetings.nothing": 1 }, "meetings."],
    [{ "engines.device": "tpu" }, "engines.device"],
    [{ "shortcuts.nothing": "Ctrl+Alt+S" }, "shortcuts.nothing: not a shortcut."],
    [{ "shortcuts.stop": "Ctrl+Alt+X" }, "shortcuts.stop: not a shortcut."],
    [{ "shortcuts.play-pause": "S" }, "shortcuts.play-pause: not a usable shortcut."],
    [{ "shortcuts.play-pause": 5 }, "shortcuts.play-pause: not a usable shortcut."],
    [{ "shortcuts.record-toggle": "Ctrl+Alt+R" }, "shortcuts.record-toggle: not a shortcut."],
    [{ port: 47700 }, "port"],
    [{ preferredPort: 47700 }, "preferredPort"],
    [{ launchAtLogin: "yes" }, "launchAtLogin"],
    [{ "transcripts.__proto__": {} }, "transcripts.__proto__ is not a setting."],
    [{ "constructor.x": 1 }, "constructor.x"],
  ])("refuses %j", (change, text) => {
    const r = validateChange(change);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain(text);
  });

  it.each(["textDays", "keepAudio", "audioDays", "trashDays", "folder"])("refuses the removed transcripts setting %s", (key) => {
    const r = validateChange({ [`transcripts.${key}`]: 1 });
    expect(r.ok === false && r.message).toContain(`transcripts.${key}`);
  });

  it("restores voiceChatVoice", () => {
    expect(validateChange({ voiceChatVoice: "alloy" })).toMatchObject({ ok: true, system: { voiceChatVoice: "alloy" } });
  });
});

describe("areaChange", () => {
  it("names each key under its area", () => {
    expect(areaChange("transcripts", { notes: true, language: "de" })).toEqual({ "transcripts.notes": true, "transcripts.language": "de" });
  });
});
