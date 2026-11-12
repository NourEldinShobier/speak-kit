import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { ARGS, ConfigPatchSchema, applyConfigPatch, parseConfig, repairedKeys } from "./schemas";
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
    expect(c.shortcuts).toEqual({ "read-selection": "Ctrl+Alt+S", stop: "Ctrl+Alt+Q", "play-pause": "Ctrl+Alt+Space" });
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
    expect(c.exportPrefs).toEqual({ format: "mp3", mp3Kbps: 192, folder: "" });
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

describe("labs and settings repair", () => {
  it("an older file without labs starts with every lab off and developer labs hidden", () => {
    const c = parseConfig({ setupDone: true, speed: 1.5 });
    expect(c.labs).toEqual({ "hide-tray-icon": false, "verbose-log": false });
    expect(c.showDeveloperLabs).toBe(false);
  });
  it("keeps valid labs, defaults the wrong ones and drops unknown ids", () => {
    expect(parseConfig({ labs: { "verbose-log": true, "hide-tray-icon": "yes", gone: true } }).labs).toEqual({ "verbose-log": true, "hide-tray-icon": false });
    expect(parseConfig({ labs: null }).labs).toEqual({ "hide-tray-icon": false, "verbose-log": false });
    expect(parseConfig({ labs: [true] }).labs).toEqual({ "hide-tray-icon": false, "verbose-log": false });
  });
  it("replaces null and wrong types field by field and keeps the good fields", () => {
    const c = parseConfig({ setupDone: true, speed: null, voice: 5, preferredPort: "1", idleUnload: ["1"], notifications: 3, startMinimized: "no", language: null });
    expect(c).toMatchObject({ setupDone: true, speed: 1, voice: "af_heart", preferredPort: 47615, idleUnload: "5", startMinimized: false, language: "system" });
    expect(c.notifications["export-done"]).toEqual({ toast: true, bell: true, sound: false });
  });
  it.each([[null], [[]], ["text"], [7], [undefined]])("a top-level %j gives all defaults", (raw) => {
    expect(parseConfig(raw)).toEqual(parseConfig({}));
  });
  it("ignores unknown keys", () => {
    expect(parseConfig({ setupDone: true, futureThing: { a: 1 } })).not.toHaveProperty("futureThing");
  });
  it("names the stored fields that were replaced, with dotted paths, and not unknown keys", () => {
    const raw = { setupDone: true, speed: "fast", futureThing: 1, notifications: { "export-done": { toast: "x", bell: true, sound: false } }, labs: { "verbose-log": true } };
    expect(repairedKeys(raw, parseConfig(raw)).sort()).toEqual(["notifications.export-done.toast", "speed"]);
  });
  it("names a whole object that was replaced and nothing for non-objects", () => {
    const raw = { dictation: "yes" };
    expect(repairedKeys(raw, parseConfig(raw))).toEqual(["dictation"]);
    expect(repairedKeys(null, parseConfig(null))).toEqual([]);
    expect(repairedKeys(parseConfig({}), parseConfig({}))).toEqual([]);
  });
});

describe("labs in a settings patch", () => {
  const ok = (labs: unknown) => v.safeParse(ConfigPatchSchema, { labs }).success;
  it("accepts one switch or all of them", () => {
    expect(ok({ "verbose-log": true })).toBe(true);
    expect(ok({ "verbose-log": true, "hide-tray-icon": false })).toBe(true);
    expect(ok({})).toBe(true);
  });
  it.each([[null], ["on"], [[true]], [{ "verbose-log": "yes" }], [{ gone: true }], [{ "verbose-log": 1 }]])("refuses %j instead of turning it into defaults", (labs) => {
    expect(ok(labs)).toBe(false);
  });
  it("a partial patch changes only the named switch", () => {
    const c = parseConfig({ labs: { "hide-tray-icon": true } });
    applyConfigPatch(c, { labs: { "verbose-log": true } });
    expect(c.labs).toEqual({ "hide-tray-icon": true, "verbose-log": true });
  });
  it("applies the other fields as before", () => {
    const c = parseConfig({});
    applyConfigPatch(c, { speed: 2, doNotDisturb: true });
    expect(c).toMatchObject({ speed: 2, doNotDisturb: true });
  });
});
