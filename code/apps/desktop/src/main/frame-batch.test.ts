import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { frameBatch } from "./frame-batch";

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("frameBatch", () => {
  it("runs a lone call at once", () => {
    const fn = vi.fn();
    frameBatch(fn, 16)();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs a burst of 25 calls twice: at once, then once when the frame ends", () => {
    const fn = vi.fn();
    const trigger = frameBatch(fn, 16);
    for (let i = 0; i < 25; i++) trigger();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(16);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("runs the next call at once after a quiet frame", () => {
    const fn = vi.fn();
    const trigger = frameBatch(fn, 16);
    trigger();
    vi.advanceTimersByTime(16);
    trigger();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
