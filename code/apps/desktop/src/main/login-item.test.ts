import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

interface Options {
  path?: string;
  args?: string[];
}

/** A stand-in for the Windows Run key: the entry reads back as enabled only when the path and args match what was registered. */
const fake = vi.hoisted(() => {
  const s = { entry: null as { path: string; args: string[] } | null, approved: true };
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
        return { openAtLogin: on, executableWillLaunchAtLogin: on && s.approved };
      },
    },
  };
});

vi.mock("electron", () => ({ app: fake.app }));

import { isLaunchAtLogin, setLaunchAtLogin } from "./login-item";

const original = { platform: process.platform, portable: process.env.PORTABLE_EXECUTABLE_FILE };

beforeEach(() => {
  fake.s.entry = null;
  fake.s.approved = true;
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
});
