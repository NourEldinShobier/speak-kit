import { describe, expect, it } from "vitest";
import { clampTrim } from "./trim-range";

const r = { startMs: 2000, endMs: 6000 };

describe("trim range sliders", () => {
  it("moves the start freely below the end", () => {
    expect(clampTrim(r, { which: "start", ms: 3000, durationMs: 10_000 })).toEqual({ startMs: 3000, endMs: 6000 });
  });
  it("stops the start half a second before the end", () => {
    expect(clampTrim(r, { which: "start", ms: 9000, durationMs: 10_000 })).toEqual({ startMs: 5500, endMs: 6000 });
  });
  it("stops the start at zero", () => {
    expect(clampTrim(r, { which: "start", ms: -300, durationMs: 10_000 })).toEqual({ startMs: 0, endMs: 6000 });
  });
  it("stops the end half a second after the start", () => {
    expect(clampTrim(r, { which: "end", ms: 1000, durationMs: 10_000 })).toEqual({ startMs: 2000, endMs: 2500 });
  });
  it("stops the end at the length of the recording", () => {
    expect(clampTrim(r, { which: "end", ms: 99_000, durationMs: 10_000 })).toEqual({ startMs: 2000, endMs: 10_000 });
  });
  it("keeps the gap a caller asks for", () => {
    expect(clampTrim(r, { which: "start", ms: 9000, durationMs: 10_000, minMs: 1000 })).toEqual({ startMs: 5000, endMs: 6000 });
    expect(clampTrim(r, { which: "end", ms: 1000, durationMs: 10_000, minMs: 1000 })).toEqual({ startMs: 2000, endMs: 3000 });
  });
});
