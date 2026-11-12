import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_DICTATION } from "../../shared/dictation/settings";
import { appOverrides, coreSettings, keepOpenMs } from "./service-support";

describe("coreSettings", () => {
  it("maps the three output options to the insert mode and the keep flag", () => {
    expect(coreSettings({ ...DEFAULT_DICTATION, output: "restore" })).toMatchObject({ insertMode: "paste", keepOnClipboard: false });
    expect(coreSettings({ ...DEFAULT_DICTATION, output: "keep" })).toMatchObject({ insertMode: "paste", keepOnClipboard: true });
    expect(coreSettings({ ...DEFAULT_DICTATION, output: "copy" })).toMatchObject({ insertMode: "copy", keepOnClipboard: false });
  });

  it("hands over keep-ready and return-to-app", () => {
    expect(coreSettings({ ...DEFAULT_DICTATION, keepReady: true, returnToApp: false })).toMatchObject({ keepReady: true, returnToApp: false });
  });

  it("turns the per-program table into insert modes: key variants are pastes", () => {
    const rules = { putty: { method: "shift-insert", delayMs: 0 }, code: { method: "type", delayMs: 0 }, keepass: { method: "copy", delayMs: 0 }, wt: { method: "ctrl-shift-v", delayMs: 0 } } as const;
    expect(coreSettings({ ...DEFAULT_DICTATION, appRules: rules }).appModes).toEqual({ putty: "paste", code: "type", keepass: "copy", wt: "paste" });
  });
});

describe("appOverrides", () => {
  it("gives each rule's keys and wait to the paste layer", () => {
    expect(appOverrides({ putty: { method: "shift-insert", delayMs: 50 } })).toEqual([{ exe: "putty", profile: { shortcut: "shift-insert", preDelayMs: 50 } }]);
    expect(appOverrides({})).toEqual([]);
  });
});

describe("keepOpenMs", () => {
  it("is 0 when released when idle, -1 when kept ready for good, and minutes otherwise", () => {
    expect(keepOpenMs({ keepReady: false, keepReadyMinutes: 30 })).toBe(0);
    expect(keepOpenMs({ keepReady: true, keepReadyMinutes: 0 })).toBe(-1);
    expect(keepOpenMs({ keepReady: true, keepReadyMinutes: 15 })).toBe(900_000);
  });
});
