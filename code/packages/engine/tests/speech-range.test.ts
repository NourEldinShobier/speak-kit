import { describe, expect, it } from "vite-plus/test";
import { speechRange } from "../src/stt/speech-range";

// The VAD speaks in centiseconds (100 per second); the audio is 16 kHz, so one centisecond is 160 samples and the margin of 0.2 s is 3200 samples.
describe("speech range", () => {
  it("runs from the first speech to the last, with 0.2 s of room on each side", () => {
    expect(
      speechRange(
        [
          { t0: 100, t1: 150 },
          { t0: 300, t1: 400 },
        ],
        16000 * 10,
      ),
    ).toEqual({ from: 100 * 160 - 3200, to: 400 * 160 + 3200 });
  });

  it("does not start before the audio does", () => {
    expect(speechRange([{ t0: 5, t1: 50 }], 16000 * 10)).toEqual({ from: 0, to: 50 * 160 + 3200 });
    expect(speechRange([{ t0: 20, t1: 50 }], 16000 * 10)).toEqual({ from: 0, to: 50 * 160 + 3200 });
    expect(speechRange([{ t0: 21, t1: 50 }], 16000 * 10)).toEqual({ from: 21 * 160 - 3200, to: 50 * 160 + 3200 });
  });

  it("does not end after the audio does", () => {
    expect(speechRange([{ t0: 100, t1: 990 }], 16000 * 10)).toEqual({ from: 100 * 160 - 3200, to: 160_000 });
    expect(speechRange([{ t0: 100, t1: 980 }], 16000 * 10)).toEqual({ from: 100 * 160 - 3200, to: 160_000 });
    expect(speechRange([{ t0: 100, t1: 979 }], 16000 * 10)).toEqual({ from: 100 * 160 - 3200, to: 979 * 160 + 3200 });
  });

  it("rounds fractional centiseconds outward to whole samples", () => {
    expect(speechRange([{ t0: 100.51, t1: 200.26 }], 16000 * 10)).toEqual({ from: 12_881, to: 35_242 });
  });

  it("is undefined when there is no speech", () => {
    expect(speechRange([], 16000)).toBeUndefined();
  });

  it("uses only the outer edges when there are several segments", () => {
    const one = speechRange([{ t0: 100, t1: 400 }], 16000 * 10);
    expect(
      speechRange(
        [
          { t0: 100, t1: 120 },
          { t0: 200, t1: 220 },
          { t0: 390, t1: 400 },
        ],
        16000 * 10,
      ),
    ).toEqual(one);
  });
});
