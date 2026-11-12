import { describe, expect, it } from "vite-plus/test";
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
    await buffer.save.length;
    await Promise.resolve();
    await Promise.resolve();
  };
  return { buffer, run, cleared, piece, at: (ms: number) => void (now = ms) };
}

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
});
