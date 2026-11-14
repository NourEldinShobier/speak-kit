import { describe, expect, it, vi } from "vite-plus/test";
import { createReplayBuffer } from "./replay-buffer";

function setup() {
  let now = 0;
  let tick: (() => void) | undefined;
  const cleared: unknown[] = [];
  const run = { startedAt: 0, segment: 0, stopped: 0, startSegment: () => void run.segment++, endSegment: async () => undefined, stop: () => void run.stopped++ };
  const buffer = createReplayBuffer({
    now: () => now,
    setInterval: (fn, ms) => ((tick = fn), ms),
    clearInterval: (h) => cleared.push(h),
  });
  buffer.attach(run);
  buffer.start(1000);
  /** What the recorder does in one piece: a video chunk and a picture, then the piece ends at its time. */
  const piece = async (endMs: number) => {
    buffer.onPayload({ kind: "video", segment: run.segment, chunk: Uint8Array.of(run.segment, 100 + run.segment) });
    buffer.onPayload({ kind: "frame", atMs: endMs - 1000, jpeg: Uint8Array.of(endMs / 1000) });
    now = endMs;
    tick?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { buffer, run, cleared, piece, at: (ms: number) => void (now = ms) };
}

describe("replay buffer: a rotation due while a save closes the piece", () => {
  it("never has two recorders running at once and loses no piece", async () => {
    let tick: (() => void) | undefined;
    const closing: (() => void)[] = [];
    // like the real recorder: ending a piece ends the one that was started last, and starting another does not end the first
    const running = new Set<number>();
    let current: number | undefined;
    let maxRunning = 0;
    let n = 0;
    const run = {
      startedAt: 0,
      startSegment: () => {
        current = ++n;
        running.add(current);
        maxRunning = Math.max(maxRunning, running.size);
      },
      endSegment: () => {
        const ending = current;
        current = undefined;
        return ending === undefined ? Promise.resolve() : new Promise<void>((resolve) => closing.push(() => (running.delete(ending), resolve())));
      },
      stop: () => {},
    };
    const buffer = createReplayBuffer({ now: () => 0, setInterval: (fn) => ((tick = fn), 1) });
    buffer.attach(run);
    buffer.start(1000);
    buffer.onPayload({ kind: "video", segment: 1, chunk: Uint8Array.of(1) });
    const saved = buffer.save();
    tick?.();
    for (let i = 0; i < 10; i++) {
      closing.splice(0).forEach((f) => f());
      await new Promise((r) => setTimeout(r, 0));
    }
    expect((await saved)?.videos.length).toBe(1);
    expect(maxRunning).toBe(1);
    expect(running.size).toBe(1);
  });
});

describe("replay buffer memory", () => {
  it("drops the oldest finished pieces once the video held is over the byte limit", async () => {
    let now = 0;
    let tick: (() => void) | undefined;
    const run = { startedAt: 0, startSegment: () => {}, endSegment: async () => undefined, stop: () => {} };
    const buffer = createReplayBuffer({ now: () => now, maxBytes: 25, setInterval: (fn) => ((tick = fn), 1) });
    buffer.attach(run);
    buffer.start(1000);
    for (let i = 1; i <= 5; i++) {
      buffer.onPayload({ kind: "video", segment: i, chunk: new Uint8Array(10).fill(i) });
      now = i * 3000;
      tick?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    // 10 bytes a piece: two finished pieces fit in 25 bytes, plus the one being recorded
    expect(buffer.held().pieces).toBe(3);
    now = 16_000;
    const clip = await buffer.save();
    expect(clip?.videos.map((v) => v[0])).toEqual([4, 5]);
  });
});

describe("replay buffer", () => {
  it("gives the newest 15 seconds as video pieces with the pictures moved to the start of the clip, and goes on recording", async () => {
    const t = setup();
    for (const end of [3000, 6000, 9000, 12_000, 15_000, 18_000, 21_000]) await t.piece(end);
    t.buffer.onPayload({ kind: "video", segment: t.run.segment, chunk: Uint8Array.of(8, 108) });
    t.at(22_000);
    const clip = await t.buffer.save();
    expect(clip?.durationMs).toBe(16_000);
    expect(clip?.videos.map((v) => [...v])).toEqual([
      [3, 103],
      [4, 104],
      [5, 105],
      [6, 106],
      [7, 107],
      [8, 108],
    ]);
    // the pictures were taken a second before each piece ended; the clip starts at 6 seconds
    expect(clip?.frames.map((f) => f.atMs)).toEqual([2000, 5000, 8000, 11_000, 14_000]);
    expect(t.run.segment).toBe(9);
  });

  it("holds no more than six finished pieces and the one being recorded", async () => {
    const t = setup();
    for (let i = 1; i <= 20; i++) await t.piece(i * 3000);
    t.at(61_000);
    t.buffer.onPayload({ kind: "video", segment: t.run.segment, chunk: Uint8Array.of(9) });
    const clip = await t.buffer.save();
    expect(clip?.videos.length).toBe(6);
    expect(clip?.durationMs).toBe(16_000);
    expect(clip?.frames.every((f) => f.atMs >= 0)).toBe(true);
  });

  it("gives what there is while less than 15 seconds were recorded", async () => {
    const t = setup();
    await t.piece(3000);
    t.buffer.onPayload({ kind: "video", segment: t.run.segment, chunk: Uint8Array.of(2, 102) });
    t.at(4000);
    const clip = await t.buffer.save();
    expect(clip?.durationMs).toBe(4000);
    expect(clip?.videos.map((v) => [...v])).toEqual([
      [1, 101],
      [2, 102],
    ]);
    expect(clip?.frames.map((f) => f.atMs)).toEqual([2000]);
  });

  it("gives nothing when no video arrived yet", async () => {
    const t = setup();
    t.at(500);
    expect(await t.buffer.save()).toBeUndefined();
  });

  it("stops the recorder and the timer", () => {
    const t = setup();
    t.buffer.stop();
    expect(t.run.stopped).toBe(1);
    expect(t.cleared).toEqual([3000]);
  });

  it("drops the oldest pieces and the pictures that belong to them as it goes", async () => {
    const t = setup();
    for (let i = 1; i <= 3; i++) await t.piece(i * 3000);
    expect(t.buffer.held()).toEqual({ pieces: 4, frames: 3 });
    for (let i = 4; i <= 20; i++) await t.piece(i * 3000);
    // six finished pieces and the one being recorded; pictures from before the oldest kept piece are gone
    expect(t.buffer.held()).toEqual({ pieces: 7, frames: 6 });
  });

  it("leaves out a piece that no video arrived for, and a picture taken after the clip ended", async () => {
    const t = setup();
    await t.piece(3000);
    t.buffer.onPayload({ kind: "frame", atMs: 9000, jpeg: Uint8Array.of(9) });
    t.at(3500);
    const clip = await t.buffer.save();
    expect(clip?.videos.map((v) => [...v])).toEqual([[1, 101]]);
    expect(clip?.durationMs).toBe(3000);
    expect(clip?.frames.map((f) => f.atMs)).toEqual([2000]);
  });

  it("ignores audio, and a video chunk before any piece began", () => {
    const t = setup();
    t.buffer.onPayload({ kind: "audio", chunk: Int16Array.of(1) });
    expect(t.buffer.held()).toEqual({ pieces: 1, frames: 0 });
  });

  it("puts the chunks of one piece together in the order they arrived", async () => {
    const t = setup();
    t.buffer.onPayload({ kind: "video", segment: 1, chunk: Uint8Array.of(1, 2) });
    t.buffer.onPayload({ kind: "video", segment: 1, chunk: Uint8Array.of(3) });
    t.buffer.onPayload({ kind: "video", segment: 1, chunk: Uint8Array.of(4, 5, 6) });
    t.at(2000);
    expect([...((await t.buffer.save())?.videos[0] ?? [])]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps a picture taken at the very end of the clip and leaves out one taken after it", async () => {
    const t = setup();
    t.buffer.onPayload({ kind: "video", segment: 1, chunk: Uint8Array.of(1) });
    t.buffer.onPayload({ kind: "frame", atMs: 2000, jpeg: Uint8Array.of(2) });
    t.buffer.onPayload({ kind: "frame", atMs: 2001, jpeg: Uint8Array.of(3) });
    t.at(2000);
    expect((await t.buffer.save())?.frames.map((f) => f.atMs)).toEqual([2000]);
  });

  it("lets go of everything when stopped, once, and can be stopped before it got a recorder", async () => {
    const t = setup();
    await t.piece(3000);
    t.buffer.stop();
    t.buffer.stop();
    expect(t.buffer.held()).toEqual({ pieces: 0, frames: 0 });
    expect(t.cleared).toEqual([3000]);
    createReplayBuffer({ now: () => 0 }).stop();
  });
});

describe("replay buffer with the system timer", () => {
  it("starts a new piece every 3 seconds and stops doing so when stopped", async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const run = { startedAt: 0, segment: 0, startSegment: () => void run.segment++, endSegment: async () => undefined, stop: () => undefined };
      const buffer = createReplayBuffer({ now: () => now });
      buffer.attach(run);
      buffer.start(1000);
      expect(run.segment).toBe(1);
      now = 3000;
      await vi.advanceTimersByTimeAsync(3000);
      expect(run.segment).toBe(2);
      buffer.stop();
      await vi.advanceTimersByTimeAsync(9000);
      expect(run.segment).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
