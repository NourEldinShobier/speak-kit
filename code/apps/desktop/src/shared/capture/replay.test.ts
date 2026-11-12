import { describe, expect, it } from "vite-plus/test";
import { clipPieces, clipTimes, fitBytes, keepPieces, REPLAY } from "./replay";

const pieces = (n: number, lengthMs = 3000) => Array.from({ length: n }, (_, i) => ({ startMs: i * lengthMs, endMs: (i + 1) * lengthMs, n: i }));

describe("replay pieces", () => {
  it("a saved replay takes the newest pieces until 15 seconds are covered", () => {
    expect(clipPieces(pieces(10)).map((p) => p.n)).toEqual([5, 6, 7, 8, 9]);
    expect(clipPieces(pieces(10), 10_000).map((p) => p.n)).toEqual([6, 7, 8, 9]);
  });

  it("takes everything while less than the window was recorded, and nothing when nothing was", () => {
    expect(clipPieces(pieces(3)).map((p) => p.n)).toEqual([0, 1, 2]);
    expect(clipPieces([])).toEqual([]);
  });

  it("a piece cut short counts for its own length", () => {
    const list = [...pieces(5), { startMs: 15_000, endMs: 16_000, n: 5 }];
    expect(clipPieces(list).map((p) => p.n)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps one piece more than a clip needs, and drops the rest", () => {
    expect(keepPieces(pieces(10)).map((p) => p.n)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(keepPieces(pieces(5)).map((p) => p.n)).toEqual([0, 1, 2, 3, 4]);
    expect(keepPieces(pieces(2)).map((p) => p.n)).toEqual([0, 1]);
    expect(keepPieces([])).toEqual([]);
  });

  it("holds 15 seconds in pieces of 3 seconds", () => {
    expect([REPLAY.windowMs, REPLAY.segmentMs]).toEqual([15_000, 3000]);
  });

  it("moves picture times to the start of the clip and leaves out earlier pictures", () => {
    const frames = [{ atMs: 11_000 }, { atMs: 12_000 }, { atMs: 14_500 }];
    expect(clipTimes(frames, 12_000)).toEqual([{ atMs: 0 }, { atMs: 2500 }]);
  });
});

describe("replay memory bound", () => {
  const sized = (...bytes: number[]) => bytes.map((b, n) => ({ b, n }));
  it("drops the oldest pieces until the rest fit", () => {
    expect(fitBytes(sized(40, 40, 40, 40), (p) => p.b, 100).map((p) => p.n)).toEqual([2, 3]);
    expect(fitBytes(sized(10, 10), (p) => p.b, 100).map((p) => p.n)).toEqual([0, 1]);
  });
  it("always keeps the newest piece, even when it alone is over the limit", () => {
    expect(fitBytes(sized(10, 500), (p) => p.b, 100).map((p) => p.n)).toEqual([1]);
    expect(fitBytes([], () => 1, 100)).toEqual([]);
  });
  it("holds 150 MiB", () => {
    expect(REPLAY.maxBytes).toBe(157_286_400);
  });
});
