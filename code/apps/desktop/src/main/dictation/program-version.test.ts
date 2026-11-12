import { describe, expect, it, vi } from "vite-plus/test";
import { createProgramVersions, readSystemVersion } from "./program-version";
import type { ForegroundInfo } from "./types";

const fg = (exe: string, pid = 1): ForegroundInfo => ({ hwnd: "1", pid, exe, className: "X", elevated: false });

describe("program versions", () => {
  it("reads a browser's version once per process and shares a read that is still running", async () => {
    const read = vi.fn(async () => "155.0.1");
    const v = createProgramVersions(read);
    v.warm(fg("chrome.exe"));
    expect(await v.lookup(fg("chrome.exe"))).toBe("155.0.1");
    expect(await v.lookup(fg("chrome.exe"))).toBe("155.0.1");
    expect(read).toHaveBeenCalledTimes(1);
    await v.lookup(fg("chrome.exe", 2));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("reads nothing for a program that is not a Chromium browser, or no window", async () => {
    const read = vi.fn(async () => "1");
    const v = createProgramVersions(read);
    expect(await v.lookup(fg("notepad.exe"))).toBeUndefined();
    expect(await v.lookup(null)).toBeUndefined();
    v.warm(null);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers undefined when the read fails or takes too long", async () => {
    expect(await createProgramVersions(async () => Promise.reject(new Error("denied"))).lookup(fg("chrome.exe"))).toBeUndefined();
    vi.useFakeTimers();
    const slow = createProgramVersions(() => new Promise(() => undefined), 100);
    const p = slow.lookup(fg("msedge.exe"));
    await vi.advanceTimersByTimeAsync(150);
    expect(await p).toBeUndefined();
    vi.useRealTimers();
  });
});

describe("reading a version from the system", () => {
  const calls: string[][] = [];
  const run = (answers: Record<string, string>) => async (file: string, args: string[]) => {
    calls.push([file, ...args]);
    return answers[file] ?? "";
  };

  it("asks PowerShell for the product version of the process on Windows, and gives nothing for an empty answer", async () => {
    calls.length = 0;
    expect(await readSystemVersion({ ...fg("chrome.exe"), pid: 4242.9 }, "win32", run({ "powershell.exe": "155.0.7000.1" }))).toBe("155.0.7000.1");
    expect(calls).toEqual([["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "(Get-Process -Id 4242).MainModule.FileVersionInfo.ProductVersion"]]);
    expect(await readSystemVersion(fg("chrome.exe"), "win32", run({}))).toBeUndefined();
  });

  it("finds the application bundle of the process on macOS and reads its version", async () => {
    calls.length = 0;
    const got = await readSystemVersion({ ...fg("com.google.Chrome"), pid: 77 }, "darwin", run({ ps: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", mdls: "156.0.1" }));
    expect(got).toBe("156.0.1");
    expect(calls).toEqual([
      ["ps", "-p", "77", "-o", "comm="],
      ["mdls", "-raw", "-name", "kMDItemVersion", "/Applications/Google Chrome.app"],
    ]);
  });

  it("gives nothing on macOS for a program outside a bundle or without a version, and nothing on other systems", async () => {
    expect(await readSystemVersion(fg("x"), "darwin", run({ ps: "/usr/bin/tool", mdls: "1.0" }))).toBeUndefined();
    expect(await readSystemVersion(fg("x"), "darwin", run({ ps: "/A/B.app/Contents/MacOS/B", mdls: "(null)" }))).toBeUndefined();
    expect(await readSystemVersion(fg("x"), "darwin", run({ ps: "/A/B.app", mdls: "2.1" }))).toBe("2.1");
    expect(await readSystemVersion(fg("x"), "linux", run({ ps: "x", mdls: "1" }))).toBeUndefined();
  });
});
