import { describe, expect, it } from "vitest";
import { createAudioTimeline } from "./audio-timeline";

const RATE = 16_000;
const BLOCK = 1280; // 80 ms

describe("audio timeline", () => {
  it("pads the time between the start of the picture and the first sound", () => {
    const t = createAudioTimeline(RATE, 1000);
    // the first block ends 1.58 s after the picture started
    expect(t.padBefore(2580, BLOCK)).toBe(1.5 * RATE);
    expect(t.total).toBe(1.5 * RATE + BLOCK);
  });
  it("does not pad a microphone that keeps up", () => {
    const t = createAudioTimeline(RATE, 0);
    expect(t.padBefore(100, BLOCK)).toBe(0);
    expect(t.padBefore(180, BLOCK)).toBe(0);
    expect(t.padBefore(260, BLOCK)).toBe(0);
    expect(t.total).toBe(3 * BLOCK);
  });
  it("pads the hole a reopened device leaves, once", () => {
    const t = createAudioTimeline(RATE, 0);
    t.padBefore(100, BLOCK);
    // the device was closed for about two seconds
    const pad = t.padBefore(2180, BLOCK);
    expect(pad).toBe(32_320);
    expect(t.padBefore(2260, BLOCK)).toBe(0);
  });
  it("ignores a gap of less than a quarter second", () => {
    const t = createAudioTimeline(RATE, 0);
    expect(t.padBefore(80 + 200, BLOCK)).toBe(0);
  });
  it("never pads negative when sound arrives early", () => {
    const t = createAudioTimeline(RATE, 5000);
    expect(t.padBefore(4000, BLOCK)).toBe(0);
    expect(t.total).toBe(BLOCK);
  });
  it("pads a very long wait without overflowing", () => {
    const t = createAudioTimeline(RATE, 0);
    expect(t.padBefore(3_600_000, BLOCK)).toBe(3600 * RATE - BLOCK);
  });
});
