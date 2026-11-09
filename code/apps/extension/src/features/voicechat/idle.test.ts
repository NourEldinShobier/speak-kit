import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { IdleTimer } from "./idle";

afterEach(() => vi.useRealTimers());
const make = () => {
  vi.useFakeTimers();
  const log: string[] = [];
  const t = new IdleTimer({ warn: (s) => log.push(`warn ${s}`), end: () => log.push("end") }, 120_000, 3);
  return { t, log };
};

describe("IdleTimer", () => {
  it("warns after the quiet time, counts down and ends", () => {
    const { t, log } = make();
    t.touch();
    vi.advanceTimersByTime(119_999);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(["warn 3"]);
    vi.advanceTimersByTime(3000);
    expect(log).toEqual(["warn 3", "warn 2", "warn 1", "end"]);
  });

  it("speech restarts the quiet time, and touching during the warning leaves it", () => {
    const { t, log } = make();
    t.touch();
    vi.advanceTimersByTime(100_000);
    t.touch();
    vi.advanceTimersByTime(100_000);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(20_000);
    expect(log).toEqual(["warn 3"]);
    t.touch();
    vi.advanceTimersByTime(10_000);
    expect(log).toEqual(["warn 3"]);
  });

  it("stop cancels everything", () => {
    const { t, log } = make();
    t.touch();
    t.stop();
    vi.advanceTimersByTime(500_000);
    expect(log).toEqual([]);
  });
});
