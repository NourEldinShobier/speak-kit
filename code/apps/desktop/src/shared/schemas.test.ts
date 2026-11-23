import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { ARGS, ConfigPatchSchema, parseConfig } from "./schemas";
import { validateChange } from "./control/settings-registry";
import { DEFAULT_SHORTCUTS } from "./shortcuts";

describe("config defaults and repair", () => {
  it("an empty or old file gets every new field", () => {
    const c = parseConfig({ setupDone: true, notifyDownload: false });
    expect(c.shortcuts).toEqual(DEFAULT_SHORTCUTS);
    expect(c).toMatchObject({ updateChannel: "stable", exportPrefs: { format: "mp3", mp3Kbps: 192, folder: "" } });
    expect("notifyDownload" in c).toBe(false);
  });

  it("loads a saved config that still has the removed update snooze and drops it", () => {
    const c = parseConfig({ updateRemindAtMs: 1_800_000_000_000 });
    expect("updateRemindAtMs" in c).toBe(false);
    expect(v.safeParse(ARGS.updateAction, ["remind-later"]).success).toBe(false);
    expect(v.safeParse(ARGS.updateAction, ["install-on-quit"]).success).toBe(true);
  });

  it("loads a saved config that still has the removed meetings section and ignores it", () => {
    const c = parseConfig({ voice: "af_bella", meetings: { enabled: true, summary: true, audioHours: 24, apps: [{ name: "Zoom" }] } });
    expect("meetings" in c).toBe(false);
    expect(c.voice).toBe("af_bella");
    expect(c.transcripts.notes).toBe(false);
  });

  it("a bad shortcut falls back to its own default, a good one is normalized", () => {
    const c = parseConfig({ shortcuts: { "read-selection": "S", "play-pause": 12 } });
    expect(c.shortcuts).toEqual({ "read-selection": "Ctrl+Alt+S", "play-pause": "Ctrl+Alt+Space" });
    expect(parseConfig({ shortcuts: { "play-pause": "alt+ctrl+q" } }).shortcuts["play-pause"]).toBe("Ctrl+Alt+Q");
  });

  it("a saved config that still has the removed record shortcut loads and drops it", () => {
    const c = parseConfig({ shortcuts: { "read-selection": "Ctrl+Alt+S", "play-pause": "Ctrl+Alt+Space", "record-toggle": "Ctrl+Alt+W" } });
    expect(c.shortcuts).toEqual(DEFAULT_SHORTCUTS);
    expect("record-toggle" in c.shortcuts).toBe(false);
  });

  it("loads a saved config that still has the removed clipboard keys and drops them", () => {
    const c = parseConfig({ clipboardPrompt: true, shortcuts: { "read-selection": "Ctrl+Alt+S", "read-clipboard": "Ctrl+Alt+C" } });
    expect("clipboardPrompt" in c).toBe(false);
    expect(c.shortcuts).toEqual(DEFAULT_SHORTCUTS);
  });

  it("loads a saved config that still has the removed General, Notifications and Accessibility settings and ignores them; a patch with any of them is refused", () => {
    const removed = {
      startMinimized: true,
      hideTrayIcon: true,
      closeAction: "quit",
      reduceMotion: "on",
      doNotDisturb: true,
      notifications: { "export-done": { toast: false, bell: false, sound: true } },
    };
    const c = parseConfig({ ...removed, updateChannel: "early", shortcuts: { stop: "Ctrl+Alt+Q", "play-pause": "Ctrl+Alt+W" } });
    for (const key of Object.keys(removed)) expect(key in c).toBe(false);
    expect(c.updateChannel).toBe("early");
    expect(c.shortcuts).toEqual({ "read-selection": "Ctrl+Alt+S", "play-pause": "Ctrl+Alt+W" });
    for (const [key, value] of Object.entries(removed)) expect(v.safeParse(ConfigPatchSchema, { [key]: value }).success).toBe(false);
  });

  it("repairs the export preferences field by field", () => {
    const c = parseConfig({ exportPrefs: { format: "ogg", mp3Kbps: 192, folder: 5 } });
    expect(c.exportPrefs).toEqual({ format: "mp3", mp3Kbps: 192, folder: "" });
  });

  it("loads a saved config that still has the removed load-at-startup setting and drops it; a patch with it is refused", () => {
    const c = parseConfig({ loadAtStart: true, updateChannel: "early" });
    expect("loadAtStart" in c).toBe(false);
    expect(c.updateChannel).toBe("early");
    expect(v.safeParse(ConfigPatchSchema, { loadAtStart: true }).success).toBe(false);
  });
});

describe("removed Settings pages", () => {
  it("a saved config that still has the experiment flags, idle unload, battery saver and update check keys loads without them; a patch with any of them is refused", () => {
    const removed = { experiments: { "caption-export": true }, idleUnload: "15", batterySaver: false, autoUpdate: false };
    const c = parseConfig({ ...removed, voice: "af_bella" });
    for (const key of Object.keys(removed)) expect(key in c).toBe(false);
    expect(c.voice).toBe("af_bella");
    for (const [key, value] of Object.entries(removed)) expect(v.safeParse(ConfigPatchSchema, { [key]: value }).success).toBe(false);
  });

  it("the settings import, the diagnostics report, the activity clear and the restart are no longer calls", () => {
    for (const method of ["importSettings", "diagnosticsReport", "clearActivity", "restartApp"]) expect(method in ARGS).toBe(false);
    expect("diagnosticsLog" in ARGS).toBe(true);
  });
});

describe("what the renderer may change", () => {
  it("accepts known keys and refuses unknown ones, including the shortcut table (it has its own call)", () => {
    expect(v.safeParse(ConfigPatchSchema, { updateChannel: "early" }).success).toBe(true);
    expect(v.safeParse(ConfigPatchSchema, { shortcuts: DEFAULT_SHORTCUTS }).success).toBe(false);
    expect(v.safeParse(ConfigPatchSchema, { token: "x" }).success).toBe(false);
  });
});

describe("IPC argument tuples", () => {
  const ok = (m: keyof typeof ARGS, args: unknown[]) => v.safeParse(ARGS[m], args).success;
  it("reader commands", () => {
    expect(ok("reader", [{ type: "toggle" }])).toBe(true);
    expect(ok("reader", [{ type: "skip", ms: -10_000 }])).toBe(true);
    expect(ok("reader", [{ type: "skip", ms: 5000 }])).toBe(false);
    expect(ok("reader", [{ type: "step", by: 2 }])).toBe(false);
    expect(ok("reader", [{ type: "keep-on-top", on: true }])).toBe(true);
    expect(ok("reader", [{ type: "delete-everything" }])).toBe(false);
  });
  it("shortcuts, updates and exports", () => {
    expect(ok("setShortcut", ["play-pause", "Ctrl+Alt+Q"])).toBe(true);
    expect(ok("setShortcut", ["stop", "Ctrl+Alt+Q"])).toBe(false);
    expect(ok("setShortcut", ["quit-everything", "Ctrl+Alt+Q"])).toBe(false);
    expect(ok("updateAction", ["install-now"])).toBe(true);
    expect(ok("updateAction", ["format-disk"])).toBe(false);
    const job = { text: "Hello.", voice: "af_heart", speed: 1, format: "mp3", mp3Kbps: 192, dir: "C:/x", name: "a" };
    expect(ok("exportStart", [job])).toBe(true);
    expect(ok("exportStart", [{ ...job, format: "flac" }])).toBe(false);
    expect(ok("exportStart", [{ ...job, mp3Kbps: 999 }])).toBe(false);
    expect(ok("exportStart", [{ ...job, text: "" }])).toBe(false);
    expect(ok("exportReveal", ["C:/x/a.mp3", false])).toBe(true);
    expect(ok("exportReveal", [42, false])).toBe(false);
  });
});

describe("interface language", () => {
  it("defaults to the system language, keeps a supported one and falls back for any other", () => {
    expect(parseConfig({}).language).toBe("system");
    expect(parseConfig({ language: "es" }).language).toBe("es");
    expect(parseConfig({ language: "klingon" }).language).toBe("system");
  });

  it("the renderer may choose a supported language only", () => {
    expect(v.safeParse(ConfigPatchSchema, { language: "es" }).success).toBe(true);
    expect(v.safeParse(ConfigPatchSchema, { language: "klingon" }).success).toBe(false);
  });
});

describe("voice chat", () => {
  const KEY = "sk-proj-Valid_Key-0123456789abcdef";
  it("the voice defaults to marin, and an unknown saved voice falls back to it", () => {
    expect(parseConfig({}).voiceChatVoice).toBe("marin");
    expect(parseConfig({ voiceChatVoice: "cedar" }).voiceChatVoice).toBe("cedar");
    expect(parseConfig({ voiceChatVoice: "nobody" }).voiceChatVoice).toBe("marin");
  });

  it("the renderer cannot set the voice through patchConfig", () => {
    expect(v.safeParse(ConfigPatchSchema, { voiceChatVoice: "cedar" }).success).toBe(false);
  });

  it("setKey trims the key and accepts only the shape of a secret key", () => {
    const parsed = v.safeParse(ARGS.voiceChatSetKey, [`  ${KEY}\n`]);
    expect(parsed.success && parsed.output).toEqual([KEY]);
    for (const bad of ["", "sk-short", "pk-proj-0123456789abcdef0123", "sk-proj-has space-0123456789abcdef", "sk-proj-has\nnewline-0123456789abcdef", `sk-${"a".repeat(500)}`, "x".repeat(2000)])
      expect(v.safeParse(ARGS.voiceChatSetKey, [bad]).success).toBe(false);
    expect(v.safeParse(ARGS.voiceChatSetKey, []).success).toBe(false);
    expect(v.safeParse(ARGS.voiceChatSetKey, [42]).success).toBe(false);
  });

  it("the registry accepts the Realtime voices only", () => {
    expect(validateChange({ voiceChatVoice: "verse" }).ok).toBe(true);
    expect(validateChange({ voiceChatVoice: "af_heart" }).ok).toBe(false);
  });
});
