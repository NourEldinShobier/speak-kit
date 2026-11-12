import { describe, expect, it, vi } from "vite-plus/test";
import { endApp, launch } from "./harness";

describe("harness cleanup", () => {
  it("ends the process when the quit does not finish in time", async () => {
    const kill = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await endApp({ close: () => new Promise<void>(() => {}) }, { kill }, 48100, 50);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("the app did not quit within 0.05 s (port 48100): ended it");
    warn.mockRestore();
  });

  it("leaves the process alone when the app closes, or is already closed", async () => {
    const kill = vi.fn();
    await endApp({ close: () => Promise.resolve() }, { kill }, 48100, 50);
    await endApp({ close: () => Promise.reject(new Error("Target page, context or browser has been closed")) }, { kill }, 48100, 50);
    expect(kill).not.toHaveBeenCalled();
  });

  it("cleans up an app the test already quit", async () => {
    const l = await launch({ env: { SPEAKKIT_TEST: "1" } });
    await l.app.close();
    await expect(l.cleanup()).resolves.toBeUndefined();
  });
});
