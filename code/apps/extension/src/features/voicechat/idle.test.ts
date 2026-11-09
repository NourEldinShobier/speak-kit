import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { IdleTimer, MAX_SESSION_MS } from "./idle";

afterEach(() => vi.useRealTimers());
const make = (capMs = MAX_SESSION_MS) => {
  vi.useFakeTimers();
  const log: string[] = [];
  const t = new IdleTimer({ warn: (s) => log.push(`warn ${s}`), end: () => log.push("end") }, { idleMs: 120_000, warnS: 3, capMs });
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

  it("the hard cap ends the conversation 15 minutes after it began, however often speech restarts the quiet time", () => {
    const { t, log } = make();
    t.touch();
    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(100_000); // server VAD noise every 100 s: never quiet for 2 minutes
      t.touch();
    }
    expect(log).toEqual([]); // 13 minutes 20 s in
    vi.advanceTimersByTime(MAX_SESSION_MS - 800_000 - 1);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(["end"]);
    vi.advanceTimersByTime(MAX_SESSION_MS);
    expect(log).toEqual(["end"]); // nothing is left running
  });

  it("Keep going leaves the warning but does not move the cap", () => {
    const { t, log } = make(150_000);
    t.touch();
    vi.advanceTimersByTime(120_000);
    expect(log).toEqual(["warn 3"]);
    t.touch(); // Keep going
    vi.advanceTimersByTime(29_999);
    expect(log).toEqual(["warn 3"]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(["warn 3", "end"]); // 150 s after the start, not 150 s after Keep going
  });

  it("the cap starts at the first touch only, and stop cancels it", () => {
    const { t, log } = make(10_000);
    t.touch();
    vi.advanceTimersByTime(6000);
    t.touch(); // reconnected
    vi.advanceTimersByTime(3999);
    expect(log).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(log).toEqual(["end"]);
    const again = make(10_000);
    again.t.touch();
    again.t.stop();
    vi.advanceTimersByTime(60_000);
    expect(again.log).toEqual([]);
  });
});
