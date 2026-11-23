import { describe, expect, it } from "vite-plus/test";
import { mixToInt16 } from "./audio";

describe("mixToInt16", () => {
  it("averages the channels and scales to 16 bits", () => {
    expect([...mixToInt16([Float32Array.from([0.5, -0.5, 0]), Float32Array.from([0.5, 0.5, 0])])]).toEqual([16384, 0, 0]);
  });
  it("clamps and handles no channels", () => {
    expect([...mixToInt16([Float32Array.from([2, -2, 1, -1])])]).toEqual([32767, -32768, 32767, -32768]);
    expect(mixToInt16([]).length).toBe(0);
  });
});
