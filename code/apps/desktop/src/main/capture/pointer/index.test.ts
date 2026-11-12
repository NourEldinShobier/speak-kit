import { describe, expect, it } from "vite-plus/test";
import { createPointerTrack } from ".";

function setup(enabled = true) {
  let now = 10_000;
  let cursor = { x: 150, y: 100 };
  let tick: (() => void) | undefined;
  const cleared: unknown[] = [];
  const intervals: number[] = [];
  const track = createPointerTrack({
    cursor: () => cursor,
    now: () => now,
    enabled: () => enabled,
    setInterval: (fn, ms) => ((tick = fn), intervals.push(ms), "timer"),
    clearInterval: (h) => cleared.push(h),
  });
  return {
    track,
    cleared,
    intervals,
    at: (ms: number, x: number, y: number) => {
      now = 10_000 + ms;
      cursor = { x, y };
      tick?.();
    },
  };
}
const rect = { x: 100, y: 50, width: 200, height: 100 };

describe("pointer track", () => {
  it("notes where the pointer is as fractions of the recorded rectangle, with the time since the recording began", () => {
    const t = setup();
    t.track.start(rect);
    t.at(200, 200, 100);
    t.at(400, 100, 150);
    expect(t.track.take()).toEqual([
      { atMs: 0, x: 0.25, y: 0.5 },
      { atMs: 200, x: 0.5, y: 0.5 },
      { atMs: 400, x: 0, y: 1 },
    ]);
    expect(t.intervals).toEqual([100]);
  });

  it("notes nothing while the pointer is outside the rectangle, and keeps at most one sample per 200 ms", () => {
    const t = setup();
    t.track.start(rect);
    t.at(100, 150, 100);
    t.at(200, 50, 100);
    t.at(300, 150, 100);
    t.at(400, 150, 100);
    expect(t.track.take().map((s) => s.atMs)).toEqual([0, 300]);
  });

  it("notes nothing while the input log is off", () => {
    const t = setup(false);
    t.track.start(rect);
    t.at(200, 150, 100);
    expect(t.track.take()).toEqual([]);
    expect(t.intervals).toEqual([]);
  });

  it("follows a switch to another rectangle, and stops when the recording ends", () => {
    const t = setup();
    t.track.start(rect);
    t.track.move({ x: 0, y: 0, width: 400, height: 200 });
    t.at(200, 200, 100);
    t.track.stop();
    t.track.move(rect);
    t.at(400, 150, 100);
    expect(t.track.take()).toEqual([
      { atMs: 0, x: 0.25, y: 0.5 },
      { atMs: 200, x: 0.5, y: 0.5 },
    ]);
    expect(t.cleared).toEqual(["timer"]);
  });

  it("hands over the samples once, and a new recording starts clean", () => {
    const t = setup();
    t.track.start(rect);
    expect(t.track.take().length).toBe(1);
    expect(t.track.take()).toEqual([]);
    t.track.start(rect);
    t.at(500, 150, 100);
    expect(t.track.take().map((s) => s.atMs)).toEqual([0, 500]);
  });

  it("notes nothing for a recording whose rectangle is not known", () => {
    const t = setup();
    t.track.start(undefined);
    t.at(200, 150, 100);
    expect(t.track.take()).toEqual([]);
  });
});
