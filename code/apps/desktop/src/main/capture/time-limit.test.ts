import { describe, expect, it } from "vitest";
import { createLimitTimer, MAX_CAPTURE_MS } from "./time-limit";

const setup = () => {
  const timers = new Map<number, () => void>();
  let next = 1;
  let limits = 0;
  const t = createLimitTimer({
    ms: 1000,
    onLimit: () => void limits++,
    set: (fn) => (timers.set(next, fn), next++),
    clear: (h) => void timers.delete(h as number),
  });
  return { t, timers, limits: () => limits };
};

describe("capture time limit", () => {
  it("is four hours", () => expect(MAX_CAPTURE_MS).toBe(14_400_000));
  it("starts one timer however often it is told the capture is recording", () => {
    const { t, timers } = setup();
    t.sync(true);
    t.sync(true);
    expect(timers.size).toBe(1);
  });
  it("fires once at the limit and can start again for the next capture", () => {
    const { t, timers, limits } = setup();
    t.sync(true);
    [...timers.values()][0]!();
    expect(limits()).toBe(1);
    t.sync(true);
    expect(timers.size).toBe(2);
  });
  it("is cancelled when the recording ends, and ending twice does nothing", () => {
    const { t, timers, limits } = setup();
    t.sync(true);
    t.sync(false);
    t.sync(false);
    expect(timers.size).toBe(0);
    expect(limits()).toBe(0);
  });
});
