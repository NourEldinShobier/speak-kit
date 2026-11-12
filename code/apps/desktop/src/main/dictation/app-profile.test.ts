import { describe, expect, it } from "vite-plus/test";
import { BASE_PROFILE, isChromiumBrowser, majorOf, profileFor } from "./app-profile";
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

describe("built-in rules", () => {
  const terminals = ["windowsterminal", "wt", "conhost", "mintty", "alacritty", "wezterm-gui", "kitty", "tabby", "putty", "conemu64", "conemu"];
  const remote = ["mstsc", "msrdc", "msrdcw", "com.microsoft.rdc.macos", "com.apple.screensharing", "com.teamviewer.teamviewer", "com.parsecgaming.parsec"];

  it("paste into every terminal with Ctrl+Shift+V, with or without .exe and in any case", () => {
    for (const t of terminals) {
      expect(profileFor(win(t)).shortcut).toBe("ctrl-shift-v");
      expect(profileFor(win(`${t.toUpperCase()}.EXE`)).shortcut).toBe("ctrl-shift-v");
    }
  });

  it("give every remote desktop client 400 ms before the keys and 3 s before the clipboard returns", () => {
    for (const r of remote) expect(profileFor(win(r))).toEqual({ shortcut: "ctrl-v", preDelayMs: 400, restoreDelayMs: 3000 });
  });

  it("keep plain Ctrl+V for Java programs", () => {
    for (const j of ["java", "javaw.exe"]) expect(profileFor(win(j)).shortcut).toBe("ctrl-v");
  });

  it("type for every Chromium browser on 155, by name and by bundle id", () => {
    const names = [
      "chrome",
      "msedge",
      "brave",
      "vivaldi",
      "opera",
      "chromium",
      "arc",
      "com.google.chrome",
      "com.microsoft.edgemac",
      "com.brave.browser",
      "com.vivaldi.vivaldi",
      "com.operasoftware.opera",
      "company.thebrowser.browser",
      "org.chromium.chromium",
    ];
    for (const n of names) expect(profileFor({ ...win(n), version: "155.1" }).shortcut).toBe("type");
    expect(profileFor({ ...win("firefox.exe"), version: "155.1" }).shortcut).toBe("ctrl-v");
  });

  it("read the first number of a version, and nothing from text that does not start with one", () => {
    expect(majorOf("155.0.7000.1")).toBe(155);
    expect(majorOf(" v156")).toBe(156);
    expect(majorOf("9999")).toBe(9999);
    expect(majorOf("12345.1")).toBeUndefined();
    expect(majorOf("x155")).toBeUndefined();
    expect(majorOf(undefined)).toBeUndefined();
    expect(isChromiumBrowser(null)).toBe(false);
    expect(isChromiumBrowser("Chrome.EXE")).toBe(true);
  });
});
