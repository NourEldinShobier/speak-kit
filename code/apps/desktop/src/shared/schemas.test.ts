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
    expect(c).toMatchObject({ doNotDisturb: false, clipboardPrompt: false, autoUpdate: true, updateRemindAtMs: 0, exportPrefs: { format: "mp3", mp3Kbps: 192, folder: "" } });
    expect("notifyDownload" in c).toBe(false);
  });

  it("a bad shortcut falls back to its own default, a good one is normalized", () => {
    const c = parseConfig({ shortcuts: { "read-selection": "S", stop: "alt+ctrl+q", "play-pause": 12, "read-clipboard": "Alt+F4" } });
    expect(c.shortcuts).toEqual({ "read-selection": "Ctrl+Alt+S", stop: "Ctrl+Alt+Q", "play-pause": "Ctrl+Alt+Space", "read-clipboard": "Ctrl+Alt+C" });
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
    expect(v.safeParse(ConfigPatchSchema, { doNotDisturb: true, clipboardPrompt: true }).success).toBe(true);
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
  it("shortcuts, engines, updates and exports", () => {
    expect(ok("setShortcut", ["stop", "Ctrl+Alt+Q"])).toBe(true);
    expect(ok("setShortcut", ["quit-everything", "Ctrl+Alt+Q"])).toBe(false);
    expect(ok("selectEngine", ["chatterbox"])).toBe(true);
    expect(ok("selectEngine", ["../etc"])).toBe(false);
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
