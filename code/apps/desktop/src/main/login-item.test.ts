import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

interface Options {
  path?: string;
  args?: string[];
}

/** A stand-in for the Windows Run key: the entry reads back as enabled only when the path and args match what was registered. */
const fake = vi.hoisted(() => {
  const s = { entry: null as { path: string; args: string[] } | null, approved: true, status: undefined as string | undefined, opened: false };
  const key = (o: Options) => ({ path: o.path ?? "C:/electron/electron.exe", args: o.args ?? [] });
  return {
    s,
    app: {
      setLoginItemSettings: (o: Options & { openAtLogin: boolean }) => {
        s.entry = o.openAtLogin ? key(o) : null;
      },
      getLoginItemSettings: (o: Options = {}) => {
        const want = key(o);
        const on = !!s.entry && s.entry.path === want.path && s.entry.args.join(" ") === want.args.join(" ");
        return {
          openAtLogin: on,
          executableWillLaunchAtLogin: on && s.approved,
          status: s.status,
          wasOpenedAtLogin: s.opened,
          launchItems: s.entry ? [{ name: "Speak Kit", path: s.entry.path, args: s.entry.args, enabled: true }] : [],
        };
      },
    },
  };
});

vi.mock("electron", () => ({ app: fake.app }));

import { isLaunchAtLogin, repairLoginItem, setLaunchAtLogin, staleEntries, startsHidden } from "./login-item";

const original = { platform: process.platform, portable: process.env.PORTABLE_EXECUTABLE_FILE };

beforeEach(() => {
  fake.s.entry = null;
  fake.s.approved = true;
  fake.s.status = undefined;
  fake.s.opened = false;
  Object.defineProperty(process, "platform", { value: "win32" });
  delete process.env.PORTABLE_EXECUTABLE_FILE;
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: original.platform });
  if (original.portable === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
  else process.env.PORTABLE_EXECUTABLE_FILE = original.portable;
});

describe("launch at login", () => {
  it("reads back on after turning it on", () => {
    setLaunchAtLogin(true, false);
    expect(isLaunchAtLogin(false)).toBe(true);
  });

  it("reads back on when it was registered with --hidden", () => {
    setLaunchAtLogin(true, true);
    expect(isLaunchAtLogin(true)).toBe(true);
    expect(fake.s.entry?.args).toEqual(["--hidden"]);
  });

  it("reads back off after turning it off", () => {
    setLaunchAtLogin(true, true);
    setLaunchAtLogin(false, true);
    expect(isLaunchAtLogin(true)).toBe(false);
  });

  it("registers the portable exe, not its temp copy", () => {
    process.env.PORTABLE_EXECUTABLE_FILE = "C:/Users/me/Speak-Kit-portable.exe";
    setLaunchAtLogin(true, false);
    expect(fake.s.entry?.path).toBe("C:/Users/me/Speak-Kit-portable.exe");
    expect(isLaunchAtLogin(false)).toBe(true);
  });

  it("reads off when Windows Startup apps has the entry disabled", () => {
    setLaunchAtLogin(true, false);
    fake.s.approved = false;
    expect(isLaunchAtLogin(false)).toBe(false);
  });

  it("reads off on macOS while the login item waits for approval in System Settings, and on once approved", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    setLaunchAtLogin(true, false);
    fake.s.status = "requires-approval";
    expect(isLaunchAtLogin(false)).toBe(false);
    fake.s.status = "enabled";
    expect(isLaunchAtLogin(false)).toBe(true);
  });
});

describe("repair after an update moved the program", () => {
  const OLD = "C:/Users/me/AppData/Local/Programs/Speak Kit old/Speak Kit.exe";

  it("points an entry for another copy at the running one and keeps the hidden start", () => {
    process.env.PORTABLE_EXECUTABLE_FILE = "C:/Users/me/AppData/Local/Programs/Speak Kit/Speak Kit.exe"; // stands for the running exe
    fake.s.entry = { path: OLD, args: ["--hidden"] };
    expect(repairLoginItem(true)).toBe(true);
    expect(fake.s.entry).toEqual({ path: "C:/Users/me/AppData/Local/Programs/Speak Kit/Speak Kit.exe", args: ["--hidden"] });
  });

  it("does nothing when the entry already holds the running path, or when there is no entry", () => {
    expect(repairLoginItem(false)).toBe(false);
    expect(fake.s.entry).toBeNull();
  });

  it("never touches macOS, where the login item belongs to the app bundle", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    fake.s.entry = { path: OLD, args: [] };
    expect(repairLoginItem(false)).toBe(false);
    expect(fake.s.entry.path).toBe(OLD);
  });

  it("matches the running path ignoring case and slash style, and ignores other programs", () => {
    const exe = "C:/Apps/Speak Kit/Speak Kit.exe";
    expect(staleEntries([{ path: "c:/apps/speak kit/SPEAK KIT.EXE" }], exe)).toEqual([]);
    expect(staleEntries([{ path: "D:/other/Speak Kit.exe" }, { path: "D:/other/Discord.exe" }], exe)).toEqual([{ path: "D:/other/Speak Kit.exe" }]);
  });
});

describe("startsHidden", () => {
  const on = { setupDone: true, hideTrayIcon: false, startMinimized: false };
  it("follows the --hidden flag after setup", () => {
    expect(startsHidden(on, ["x", "--hidden"], false)).toBe(true);
    expect(startsHidden(on, ["x"], false)).toBe(false);
  });
  it("never starts hidden before setup is done, with the tray icon hidden, or when the system would not create it", () => {
    expect(startsHidden({ ...on, setupDone: false }, ["--hidden"], false)).toBe(false);
    expect(startsHidden({ ...on, hideTrayIcon: true }, ["--hidden"], false)).toBe(false);
    expect(startsHidden(on, ["--hidden"], true)).toBe(false);
  });
  it("starts hidden when the person chose Start minimized and Windows opened it at login", () => {
    setLaunchAtLogin(true, true);
    expect(startsHidden({ ...on, startMinimized: true }, [], false)).toBe(false); // started by hand
    fake.s.opened = true;
    expect(startsHidden({ ...on, startMinimized: true }, [], false)).toBe(true);
    expect(startsHidden(on, [], false)).toBe(false); // the person did not choose Start minimized
  });
});
