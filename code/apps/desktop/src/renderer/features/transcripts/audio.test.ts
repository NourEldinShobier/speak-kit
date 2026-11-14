import { describe, expect, it } from "vite-plus/test";
import { Batcher, levelOf, micCode, mixToInt16 } from "./audio";

describe("mixToInt16", () => {
  it("averages the channels and scales to 16 bits", () => {
    expect([...mixToInt16([Float32Array.from([0.5, -0.5, 0]), Float32Array.from([0.5, 0.5, 0])])]).toEqual([16384, 0, 0]);
  });
  it("clamps and handles no channels", () => {
    expect([...mixToInt16([Float32Array.from([2, -2, 1, -1])])]).toEqual([32767, -32768, 32767, -32768]);
    expect(mixToInt16([]).length).toBe(0);
  });
});

describe("levelOf", () => {
  it("is 0 for silence and no samples, boosted RMS otherwise, at most 1", () => {
    expect(levelOf(new Float32Array(0))).toBe(0);
    expect(levelOf(new Float32Array(100))).toBe(0);
    expect(levelOf(new Float32Array(100).fill(0.1))).toBeCloseTo(0.6, 5);
    expect(levelOf(new Float32Array(100).fill(0.9))).toBe(1);
  });
});

describe("micCode", () => {
  it.each([
    ["NotAllowedError", "mic-denied"],
    ["SecurityError", "mic-denied"],
    ["NotFoundError", "mic-missing"],
    ["OverconstrainedError", "mic-missing"],
    ["NotReadableError", "mic-busy"],
    ["AbortError", "mic-busy"],
    ["SomethingElse", "mic-failed"],
  ])("%s is %s", (name, code) => expect(micCode({ name })).toBe(code));
  it("anything without a name is a failure", () => {
    expect(micCode(null)).toBe("mic-failed");
    expect(micCode("x")).toBe("mic-failed");
  });
});

describe("Batcher", () => {
  it("hands over a batch once enough samples came, keeping order, and starts a new one", () => {
    const b = new Batcher(4);
    expect(b.push(Float32Array.from([0.5, 0.5]))).toBeUndefined();
    expect([...b.push(Float32Array.from([-0.5, 0.25]))!]).toEqual([16384, 16384, -16384, 8192]);
    expect(b.push(Float32Array.from([1]))).toBeUndefined();
    expect([...b.flush()!]).toEqual([32767]);
    expect(b.flush()).toBeUndefined();
  });
  it("a block larger than the size is one batch", () => {
    expect(new Batcher(2).push(new Float32Array(5))!.length).toBe(5);
  });
});
