import { describe, expect, it, vi } from "vite-plus/test";
import { createProgramVersions } from "./program-version";
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
