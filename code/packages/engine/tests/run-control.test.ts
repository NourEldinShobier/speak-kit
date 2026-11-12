import { describe, expect, it, vi } from "vite-plus/test";
import { runControl } from "../src/stt/run-control";

describe("run control", () => {
  it("stops the running job through its native stop", async () => {
    const c = runControl(vi.fn());
    const stop = vi.fn();
    expect(c.start(7)).toBe(true);
    c.attach(stop);
    c.abort(7);
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(c.aborted()).toBe(true);
    c.end();
    expect(c.aborted()).toBe(false);
  });

  it("skips a job that was aborted while it waited, and leaves the next one alone", () => {
    const c = runControl(vi.fn());
    c.abort(3);
    expect(c.start(3)).toBe(false);
    expect(c.start(4)).toBe(true);
    expect(c.aborted()).toBe(false);
  });

  it("an abort that came before the inference started stops it as soon as it has a stop", async () => {
    const c = runControl(vi.fn());
    c.start(1);
    c.abort(1);
    const stop = vi.fn();
    c.attach(stop);
    await Promise.resolve();
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("an abort for another job does not touch the running one, and a failing stop is reported", async () => {
    const failed = vi.fn();
    const c = runControl(failed);
    c.start(1);
    const stop = vi.fn(() => Promise.reject(new Error("native")));
    c.attach(stop);
    c.abort(2);
    expect(stop).not.toHaveBeenCalled();
    c.abort(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledWith(new Error("native"));
  });
});
