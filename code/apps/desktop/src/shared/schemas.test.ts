import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { ARGS, ConfigPatchSchema, parseConfig } from "./schemas";
import { DEFAULT_SHORTCUTS } from "./shortcuts";

describe("config defaults and repair", () => {
  it("an empty or old file gets every new field", () => {
    const c = parseConfig({ setupDone: true, notifyDownload: false });
    expect(c.shortcuts).toEqual(DEFAULT_SHORTCUTS);
    expect(c.notifications["export-done"]).toEqual({ toast: true, bell: true, sound: false });
    expect(c.notifications["reading-finished"]).toEqual({ toast: false, bell: false, sound: false });
    expect(c.notifications["engine-error"].sound).toBe(true);
    expect(c).toMatchObject({ doNotDisturb: false, autoUpdate: true, exportPrefs: { format: "mp3", mp3Kbps: 192, folder: "" } });
    expect("notifyDownload" in c).toBe(false);
  });

  it("loads a saved config that still has the removed update snooze and drops it", () => {
    const c = parseConfig({ updateRemindAtMs: 1_800_000_000_000 });
    expect("updateRemindAtMs" in c).toBe(false);
    expect(v.safeParse(ARGS.updateAction, ["remind-later"]).success).toBe(false);
    expect(v.safeParse(ARGS.updateAction, ["install-on-quit"]).success).toBe(true);
  });

  it("a bad shortcut falls back to its own default, a good one is normalized", () => {
    const c = parseConfig({ shortcuts: { "read-selection": "S", stop: "alt+ctrl+q", "play-pause": 12 } });
    expect(c.shortcuts).toEqual({ "read-selection": "Ctrl+Alt+S", stop: "Ctrl+Alt+Q", "play-pause": "Ctrl+Alt+Space", "record-toggle": "Ctrl+Alt+R" });
  });

  it("a config saved before the record shortcut existed gets its default", () => {
    expect(parseConfig({ shortcuts: { "read-selection": "Ctrl+Alt+S", "play-pause": "Ctrl+Alt+Space", stop: "Ctrl+Alt+X" } }).shortcuts["record-toggle"]).toBe("Ctrl+Alt+R");
  });

  it("loads a saved config that still has the removed clipboard keys and drops them", () => {
    const c = parseConfig({ clipboardPrompt: true, shortcuts: { "read-selection": "Ctrl+Alt+S", "read-clipboard": "Ctrl+Alt+C" } });
    expect("clipboardPrompt" in c).toBe(false);
    expect(c.shortcuts).toEqual(DEFAULT_SHORTCUTS);
  });

  it("loads a saved config that still has the removed download-done notification", () => {
    const c = parseConfig({ notifications: { "download-done": { toast: true, bell: true, sound: true }, "export-done": { toast: false, bell: false, sound: false } } });
    expect(Object.keys(c.notifications)).toEqual(["reading-finished", "export-done", "engine-error", "update-ready"]);
    expect(c.notifications["export-done"]).toEqual({ toast: false, bell: false, sound: false });
  });
  it("repairs a half-written notifications table and export preferences field by field", () => {
    const c = parseConfig({ notifications: { "export-done": { toast: false }, "update-ready": "yes" }, exportPrefs: { format: "ogg", mp3Kbps: 192, folder: 5 } });
    expect(c.notifications["export-done"]).toEqual({ toast: false, bell: true, sound: false });
    expect(c.notifications["update-ready"]).toEqual({ toast: true, bell: true, sound: false });
    expect(c.exportPrefs).toEqual({ format: "mp3", mp3Kbps: 192, folder: "", captions: "none", chapters: false });
  });
});

describe("what the renderer may change", () => {
  it("accepts known keys and refuses unknown ones, including the shortcut table (it has its own call)", () => {
    expect(v.safeParse(ConfigPatchSchema, { doNotDisturb: true }).success).toBe(true);
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
    expect(ok("setShortcut", ["stop", "Ctrl+Alt+Q"])).toBe(true);
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

  it("setVoice accepts the Realtime voices only", () => {
    expect(v.safeParse(ARGS.voiceChatSetVoice, ["verse"]).success).toBe(true);
    expect(v.safeParse(ARGS.voiceChatSetVoice, ["af_heart"]).success).toBe(false);
  });
});
