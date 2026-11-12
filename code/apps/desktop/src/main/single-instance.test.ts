import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";
import { acquireInstance, classifySecondLaunch, clearRunningVersion, isNewer, readRunningVersion, stopGuard, writeRunningVersion } from "./single-instance";

describe("isNewer", () => {
  it.each([
    ["1.2.0", "1.1.9", true],
    ["1.10.0", "1.9.0", true],
    ["1.0.0", "1.0.0", false],
    ["1.0.0", "1.0.1", false],
    ["2.0", "1.9.9", true],
    ["1.0.0", "1.0.0-beta.1", true],
    ["1.0.0-beta.1", "1.0.0", false],
  ])("%s newer than %s is %s", (a, b, want) => expect(isNewer(a, b)).toBe(want));
});

describe("classifySecondLaunch", () => {
  it("--quit asks the running instance to leave", () => expect(classifySecondLaunch(["x", "--quit"], "1.0.0", undefined)).toBe("quit"));
  it("a newer copy asks it to leave", () => expect(classifySecondLaunch(["x"], "1.0.0", { version: "1.1.0" })).toBe("replace"));
  it("the same or an older copy just shows the window", () => {
    expect(classifySecondLaunch(["x"], "1.1.0", { version: "1.1.0" })).toBe("open");
    expect(classifySecondLaunch(["x"], "1.1.0", { version: "1.0.0" })).toBe("open");
  });
  it("ignores additional data of the wrong shape", () => {
    expect(classifySecondLaunch(["x"], "1.0.0", "9.9.9")).toBe("open");
    expect(classifySecondLaunch(["x"], "1.0.0", { version: 9 })).toBe("open");
    expect(classifySecondLaunch(["x"], "1.0.0", null)).toBe("open");
  });
});

describe("acquireInstance", () => {
  const wait = () => Promise.resolve();
  it("runs when the lock is free", async () => {
    expect(await acquireInstance({ tryLock: () => true, runningVersion: async () => null, ownVersion: "1.0.0", wait })).toBe(true);
  });
  it("gives up when the holder is the same version or newer, without waiting", async () => {
    const w = vi.fn(wait);
    expect(await acquireInstance({ tryLock: () => false, runningVersion: async () => "1.0.0", ownVersion: "1.0.0", wait: w })).toBe(false);
    expect(await acquireInstance({ tryLock: () => false, runningVersion: async () => "2.0.0", ownVersion: "1.0.0", wait: w })).toBe(false);
    expect(w).not.toHaveBeenCalled();
  });
  it("gives up when the holder's version is unknown", async () => {
    expect(await acquireInstance({ tryLock: () => false, runningVersion: async () => null, ownVersion: "1.0.0", wait })).toBe(false);
  });
  it("takes over once an older holder leaves", async () => {
    let calls = 0;
    const ok = await acquireInstance({ tryLock: () => ++calls === 4, runningVersion: async () => "0.9.0", ownVersion: "1.0.0", wait });
    expect(ok).toBe(true);
    expect(calls).toBe(4);
  });
  it("stops waiting after the replace window", async () => {
    let calls = 0;
    const ok = await acquireInstance({ tryLock: () => (calls++, false), runningVersion: async () => "0.9.0", ownVersion: "1.0.0", wait, stepMs: 1000, replaceMs: 5000 });
    expect(ok).toBe(false);
    expect(calls).toBe(6);
  });
});

describe("stopGuard", () => {
  it("exits when the stop request has not ended the app in time", () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    stopGuard(exit, 20_000);
    vi.advanceTimersByTime(19_999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("does nothing once cancelled", () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    stopGuard(exit, 20_000)();
    vi.advanceTimersByTime(60_000);
    expect(exit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("running version file", () => {
  it("round-trips and is cleared", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "speakkit-inst-"));
    expect(await readRunningVersion(dir)).toBeNull();
    await writeRunningVersion(dir, "1.4.2");
    expect(await readRunningVersion(dir)).toBe("1.4.2");
    await clearRunningVersion(dir);
    expect(await readRunningVersion(dir)).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});
