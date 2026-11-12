import { describe, expect, it } from "vite-plus/test";
import { Batcher, levelOf, micCode } from "./audio";

describe("meeting audio helpers", () => {
  it("batches blocks into pieces of at least a second and flushes the rest", () => {
    const b = new Batcher(4);
    expect(b.push(new Float32Array([0.5, -0.5]))).toBeUndefined();
    expect(Array.from(b.push(new Float32Array([1, -1, 2]))!)).toEqual([16384, -16384, 32767, -32768, 32767]);
    expect(b.flush()).toBeUndefined();
    b.push(new Float32Array([0]));
    expect(Array.from(b.flush()!)).toEqual([0]);
  });

  it("measures loudness with a boost, silent for nothing and capped at 1", () => {
    expect(levelOf(new Float32Array(0))).toBe(0);
    expect(levelOf(new Float32Array(100))).toBe(0);
    expect(levelOf(new Float32Array(100).fill(0.1))).toBeCloseTo(0.6);
    expect(levelOf(new Float32Array(100).fill(0.9))).toBe(1);
  });

  it("names why the microphone could not be opened", () => {
    expect(micCode({ name: "NotAllowedError" })).toBe("mic-denied");
    expect(micCode({ name: "NotFoundError" })).toBe("mic-missing");
    expect(micCode({ name: "OverconstrainedError" })).toBe("mic-missing");
    expect(micCode({ name: "NotReadableError" })).toBe("mic-busy");
    expect(micCode(new Error("x"))).toBe("mic-failed");
    expect(micCode(null)).toBe("mic-failed");
  });
});
