import { describe, expect, it } from "vite-plus/test";
import { planPaste, type PlanInput, type Target } from "../src/paste-plan";

const win = (extra: Partial<Target> = {}): Target => ({ id: "w1", exe: "notepad.exe", elevated: false, passwordField: false, ...extra });
const plan = (extra: Partial<PlanInput> = {}) => planPaste({ target: win(), current: win(), settings: { insertMode: "paste", appModes: {} }, interrupted: false, ...extra });
const paste = { method: "paste" };

describe("paste plan by program", () => {
  // Which keys a program needs (Ctrl+Shift+V in terminals, longer waits for remote desktop) is the operating system layer's business: the plan only names the method.
  for (const exe of ["notepad.exe", "WindowsTerminal.exe", "mstsc.exe", "java.exe"]) it(`${exe} is pasted into`, () => expect(plan({ target: win({ exe }), current: win({ exe }) })).toEqual(paste));
});

describe("paste plan by situation", () => {
  it("refuses a password field, also when the focus never moved", () => {
    expect(plan({ current: win({ passwordField: true }) })).toEqual({ method: "refuse", reason: "password-field" });
  });

  it("refuses a password field that was only known at press time when the current window cannot be read", () => {
    expect(plan({ target: win({ passwordField: true }), current: undefined })).toEqual({ method: "refuse", reason: "password-field" });
  });

  it("a password field wins over every other reason", () => {
    expect(plan({ current: win({ id: "w2", passwordField: true, elevated: true }), interrupted: true })).toEqual({ method: "refuse", reason: "password-field" });
  });

  it("copies when the foreground window changed since the key press", () => {
    expect(plan({ current: win({ id: "w2" }) })).toEqual({ method: "copy", reason: "focus-changed" });
  });

  it("copies when the window is elevated", () => {
    expect(plan({ current: win({ elevated: true }) })).toEqual({ method: "copy", reason: "elevated" });
  });

  it("copies when the recording was cut short", () => {
    expect(plan({ interrupted: true })).toEqual({ method: "copy", reason: "interrupted" });
  });

  it("copies when there was no window at press time, even if there is one now", () => {
    expect(plan({ target: undefined })).toEqual({ method: "copy", reason: "no-target" });
    expect(plan({ target: undefined, current: undefined })).toEqual({ method: "copy", reason: "no-target" });
  });

  it("uses the press-time window when the current one cannot be read", () => {
    expect(plan({ current: undefined })).toEqual(paste);
    expect(plan({ target: win({ elevated: true }), current: undefined })).toEqual({ method: "copy", reason: "elevated" });
  });

  it("interrupted wins over focus change, which wins over elevation", () => {
    expect(plan({ interrupted: true, current: win({ id: "w2" }) })).toEqual({ method: "copy", reason: "interrupted" });
    expect(plan({ current: win({ id: "w2", elevated: true }) })).toEqual({ method: "copy", reason: "focus-changed" });
  });
});

describe("paste plan by setting", () => {
  const settings = (insertMode: "paste" | "type" | "copy", appModes: Record<string, "paste" | "type" | "copy"> = {}) => ({ insertMode, appModes });

  it("follows the insert mode", () => {
    expect(plan({ settings: settings("type") })).toEqual({ method: "type" });
    expect(plan({ settings: settings("copy") })).toEqual({ method: "copy", reason: "setting" });
  });

  it("a per-program mode overrides the default, matched without .exe and ignoring case", () => {
    const s = settings("paste", { putty: "type", notepad: "copy" });
    expect(plan({ target: win({ exe: "PuTTY.exe" }), current: win({ exe: "PuTTY.exe" }), settings: s })).toEqual({ method: "type" });
    expect(plan({ settings: s })).toEqual({ method: "copy", reason: "setting" });
    expect(plan({ target: win({ exe: "chrome.exe" }), current: win({ exe: "chrome.exe" }), settings: s })).toEqual(paste);
  });

  it("a per-program mode can switch a global copy setting back to paste", () => {
    expect(plan({ settings: settings("copy", { notepad: "paste" }) })).toEqual(paste);
  });

  it("a type setting does not override the refusal", () => {
    expect(plan({ current: win({ passwordField: true }), settings: settings("type") })).toEqual({ method: "refuse", reason: "password-field" });
  });
});
