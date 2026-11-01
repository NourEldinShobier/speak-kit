import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { frameBatch } from "./frame-batch";

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("frameBatch", () => {
  it("runs once for a burst of calls, after the frame", () => {
    const fn = vi.fn();
    const trigger = frameBatch(fn, 16);
    for (let i = 0; i < 25; i++) trigger();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs again for a call after the frame", () => {
    const fn = vi.fn();
    const trigger = frameBatch(fn, 16);
    trigger();
    vi.advanceTimersByTime(16);
    trigger();
    trigger();
    vi.advanceTimersByTime(16);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
