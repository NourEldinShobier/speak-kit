import { describe, expect, it } from "vite-plus/test";
import { ClipBuffer, micCode } from "./capture";

const block = (n: number, v: number) => new Float32Array(n).fill(v);

describe("clip buffer pieces", () => {
  const rig = (pieceMs = 100) => {
    const pieces: Float32Array[] = [];
    return { pieces, b: new ClipBuffer(1000, 1000, { onPiece: (p) => pieces.push(p), ms: pieceMs }) };
  };

  it("hands over the samples of a running recording in order, in pieces, with the pre-roll in the first", () => {
    const { b, pieces } = rig(100);
    b.push(block(300, 0.1));
    b.start(50);
    b.push(block(60, 0.2));
    b.push(block(60, 0.3));
    expect(pieces.map((p) => p.length)).toEqual([110]);
    expect([pieces[0]![0], pieces[0]![49], pieces[0]![50], pieces[0]![109]]).toEqual([expect.closeTo(0.1), expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.2)]);
    expect(b.stop()!.pcm).toHaveLength(170);
    expect(pieces.map((p) => p.length)).toEqual([110, 60]);
  });

  it("hands over nothing while no recording runs", () => {
    const { b, pieces } = rig(10);
    b.push(block(500, 0.5));
    expect(pieces).toEqual([]);
  });

  it("hands over what is left when the recording stops, and does not repeat it", () => {
    const { b, pieces } = rig(1000);
    b.start(0);
    b.push(block(40, 0.5));
    expect(pieces).toEqual([]);
    b.stop();
    b.stop();
    expect(pieces.map((p) => p.length)).toEqual([40]);
  });

  it("drops the unsent samples of a discarded recording", () => {
    const { b, pieces } = rig(1000);
    b.start(0);
    b.push(block(40, 0.5));
    b.discard();
    b.start(0);
    b.push(block(10, 0.5));
    b.stop();
    expect(pieces.map((p) => p.length)).toEqual([10]);
  });

  it("works without a receiver", () => {
    const b = new ClipBuffer(1000, 1000);
    b.start(0);
    b.push(block(5000, 0.5));
    expect(b.stop()!.pcm).toHaveLength(5000);
  });
});

describe("clip buffer", () => {
  it("records what arrives after start, and nothing before when there is no pre-roll", () => {
    const b = new ClipBuffer(1000, 1000);
    b.push(block(100, 0.1));
    b.start(0);
    b.push(block(50, 0.5));
    const clip = b.stop()!;
    expect(clip.pcm).toHaveLength(50);
    expect(clip.peak).toBe(0.5);
  });

  it("starts the recording with the last part of what it heard before, as asked", () => {
    const b = new ClipBuffer(1000, 1000);
    b.push(block(300, 0.1));
    b.push(block(300, 0.2));
    b.start(450); // 450 ms at 1000 Hz
    b.push(block(10, 0.3));
    const clip = b.stop()!;
    expect(clip.pcm).toHaveLength(460);
    expect(clip.pcm[0]).toBeCloseTo(0.1); // 150 samples of the older block, then 300 of the newer
    expect(clip.pcm[149]).toBeCloseTo(0.1);
    expect(clip.pcm[150]).toBeCloseTo(0.2);
    expect(clip.pcm[459]).toBeCloseTo(0.3);
  });

  it("gives all it has when the pre-roll is longer than the history", () => {
    const b = new ClipBuffer(1000, 1000);
    b.push(block(100, 0.1));
    b.start(450);
    expect(b.stop()!.pcm).toHaveLength(100);
  });

  it("keeps only about the history length", () => {
    const b = new ClipBuffer(1000, 500);
    for (let i = 0; i < 10; i++) b.push(block(200, i / 10));
    b.start(10_000);
    const n = b.stop()!.pcm.length;
    expect(n).toBeGreaterThanOrEqual(500);
    expect(n).toBeLessThan(700);
  });

  it("stop returns null when nothing was recording, and a second stop too", () => {
    const b = new ClipBuffer(1000, 500);
    expect(b.stop()).toBeNull();
    b.start(0);
    expect(b.recording).toBe(true);
    expect(b.stop()).not.toBeNull();
    expect(b.recording).toBe(false);
    expect(b.stop()).toBeNull();
  });

  it("discard drops the recording but keeps listening", () => {
    const b = new ClipBuffer(1000, 500);
    b.start(0);
    b.push(block(10, 1));
    b.discard();
    expect(b.stop()).toBeNull();
    b.push(block(100, 0.2));
    b.start(50);
    expect(b.stop()!.pcm).toHaveLength(50);
  });

  it("clear forgets the history so the next recording has no pre-roll from before", () => {
    const b = new ClipBuffer(1000, 500);
    b.push(block(300, 0.4));
    b.clear();
    b.start(300);
    expect(b.stop()!.pcm).toHaveLength(0);
  });

  it("reports the loudest sample as the peak, whatever its sign", () => {
    const b = new ClipBuffer(1000, 500);
    b.start(0);
    b.push(Float32Array.of(0.2, -0.9, 0.4));
    expect(b.stop()!.peak).toBeCloseTo(0.9);
  });
});

describe("microphone errors", () => {
  it.each([
    ["NotAllowedError", "mic-denied"],
    ["SecurityError", "mic-denied"],
    ["NotFoundError", "mic-missing"],
    ["OverconstrainedError", "mic-missing"],
    ["NotReadableError", "mic-busy"],
    ["AbortError", "mic-busy"],
    ["TypeError", "mic-failed"],
  ])("%s is %s", (name, code) => {
    expect(micCode({ name })).toBe(code);
  });
  it("treats anything else as a failure", () => {
    expect(micCode(null)).toBe("mic-failed");
    expect(micCode("boom")).toBe("mic-failed");
  });
});

describe("clip buffer silence padding", () => {
  it("adds silence of the given length to a running recording and sends it on in the pieces", () => {
    const pieces: Float32Array[] = [];
    const b = new ClipBuffer(1000, 1000, { onPiece: (p) => pieces.push(p), ms: 100 });
    b.start(0);
    b.push(block(50, 1));
    b.pad(70);
    b.push(block(10, 1));
    expect(pieces.map((p) => p.length)).toEqual([120]);
    expect(b.stop()!.pcm).toHaveLength(130);
  });

  it("adds nothing when no recording runs or the gap rounds to no samples", () => {
    const b = new ClipBuffer(1000, 1000);
    b.pad(50);
    b.start(0);
    b.pad(0);
    expect(b.stop()!.pcm).toHaveLength(0);
    expect(b.stop()).toBeNull();
  });
});
