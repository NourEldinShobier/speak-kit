import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NOTICE_TTL_MS } from "../shared/tray-notices";
import { createNoticeCenter } from "./tray-notice";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the tray notice center", () => {
  it("shows an error that happened while the window was closed and rebuilds the menu", () => {
    const refresh = vi.fn();
    const c = createNoticeCenter(refresh, () => false);
    c.report("error", "The voice engine failed to start");
    expect(c.current()).toBe("The voice engine failed to start");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a problem that happened while the window is open, and activity that is not an error", () => {
    const refresh = vi.fn();
    const open = createNoticeCenter(refresh, () => true);
    open.report("error", "Something failed");
    const closed = createNoticeCenter(refresh, () => false);
    closed.report("pair", "Browser paired");
    expect(open.current()).toBeUndefined();
    expect(closed.current()).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("clears when the window opens and rebuilds the menu", () => {
    const refresh = vi.fn();
    const c = createNoticeCenter(refresh, () => false);
    c.report("error", "Failed");
    c.clear();
    expect(c.current()).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("rebuilds the menu once the notice has expired, so it does not stay in the menu", () => {
    const refresh = vi.fn();
    const c = createNoticeCenter(refresh, () => false);
    c.report("error", "Failed");
    refresh.mockClear();
    vi.advanceTimersByTime(NOTICE_TTL_MS);
    expect(c.current()).toBeUndefined();
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a newer problem restarts the wait", () => {
    const refresh = vi.fn();
    const c = createNoticeCenter(refresh, () => false);
    c.report("error", "First");
    vi.advanceTimersByTime(NOTICE_TTL_MS - 1000);
    c.report("error", "Second");
    refresh.mockClear();
    vi.advanceTimersByTime(NOTICE_TTL_MS);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(c.current()).toBeUndefined();
  });
});
