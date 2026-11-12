import { describe, expect, it } from "vite-plus/test";
import { BASE_PROFILE, profileFor } from "./app-profile";
import type { ForegroundInfo } from "./types";

const win = (exe: string | null): ForegroundInfo => ({ hwnd: "1", pid: 1, exe, className: "X", elevated: false });

describe("profileFor", () => {
  it("pastes with Ctrl+V and restores at 500 ms when nothing is special", () => {
    expect(profileFor(win("notepad.exe"))).toEqual({ shortcut: "ctrl-v", preDelayMs: 0, restoreDelayMs: 500 });
    expect(profileFor(null)).toEqual(BASE_PROFILE);
    expect(profileFor(win(null))).toEqual(BASE_PROFILE);
  });

  it("uses Ctrl+Shift+V in terminals, in any letter case", () => {
    expect(profileFor(win("WindowsTerminal.exe")).shortcut).toBe("ctrl-shift-v");
    expect(profileFor(win("mintty.exe")).shortcut).toBe("ctrl-shift-v");
  });

  it("gives remote desktop clients 400 ms before the keys and 3 s before the restore", () => {
    expect(profileFor(win("mstsc.exe"))).toEqual({ shortcut: "ctrl-v", preDelayMs: 400, restoreDelayMs: 3000 });
    expect(profileFor(win("msrdc.exe")).restoreDelayMs).toBe(3000);
  });

  it("keeps Java programs on plain Ctrl+V", () => {
    expect(profileFor(win("javaw.exe")).shortcut).toBe("ctrl-v");
  });

  it("lets a user rule replace a built-in one for the same program, field by field", () => {
    const user = [{ exe: "MSTSC", profile: { shortcut: "type" as const } }];
    expect(profileFor(win("mstsc.exe"), user)).toEqual({ shortcut: "type", preDelayMs: 400, restoreDelayMs: 3000 });
    expect(profileFor(win("notepad.exe"), user)).toEqual(BASE_PROFILE);
  });

  it("lets a user rule turn a terminal back to Ctrl+V or never paste into a program", () => {
    expect(profileFor(win("conhost.exe"), [{ exe: "conhost.exe", profile: { shortcut: "ctrl-v" } }]).shortcut).toBe("ctrl-v");
    expect(profileFor(win("keepass.exe"), [{ exe: "keepass", profile: { shortcut: "copy" } }]).shortcut).toBe("copy");
  });
});

describe("profileFor on macOS", () => {
  it("names programs by bundle identifier, in any letter case, and pastes with plain Cmd+V in terminals", () => {
    expect(profileFor(win("com.apple.Terminal")).shortcut).toBe("ctrl-v");
    expect(profileFor(win("com.microsoft.rdc.macos"))).toEqual({ shortcut: "ctrl-v", preDelayMs: 400, restoreDelayMs: 3000 });
    expect(profileFor(win("com.apple.ScreenSharing")).preDelayMs).toBe(400);
  });

  it("lets a user rule ask for Cmd+Shift+V in a terminal", () => {
    expect(profileFor(win("com.googlecode.iterm2"), [{ exe: "com.googlecode.iterm2", profile: { shortcut: "ctrl-shift-v" } }]).shortcut).toBe("ctrl-shift-v");
  });
});

describe("browsers built on Chromium 155 and 156", () => {
  const browser = (exe: string, version?: string): ForegroundInfo => ({ ...win(exe), ...(version && { version }) });

  it("type the text for those two versions, and paste normally for 154, 157 and an unknown version", () => {
    expect(profileFor(browser("chrome.exe", "155.0.7000.1")).shortcut).toBe("type");
    expect(profileFor(browser("msedge.exe", "156.2.1")).shortcut).toBe("type");
    expect(profileFor(browser("com.google.Chrome", "156")).shortcut).toBe("type");
    for (const v of ["154.0.1", "157.0.1", "1550.0", "15.5", "", "garbage", undefined]) expect(profileFor(browser("chrome.exe", v)).shortcut).toBe("ctrl-v");
  });

  it("leave other programs alone even when the version number matches, and the user's own rule still wins", () => {
    expect(profileFor(browser("notepad.exe", "155.0.1")).shortcut).toBe("ctrl-v");
    expect(profileFor(browser("chrome.exe", "155.0.1"), [{ exe: "chrome", profile: { shortcut: "ctrl-v" } }]).shortcut).toBe("ctrl-v");
    expect(profileFor(browser("chrome.exe", "155.0.1"), [{ exe: "chrome", profile: { preDelayMs: 50 } }])).toEqual({ shortcut: "type", preDelayMs: 50, restoreDelayMs: 500 });
  });
});
