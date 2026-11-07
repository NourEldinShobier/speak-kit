import { describe, expect, it } from "vite-plus/test";
import { FrameDecoder, encodeFrame, floatToInt16 } from "./frames";

describe("frames", () => {
  it("round-trips audio and done frames split at arbitrary byte boundaries", () => {
    const pcm = floatToInt16(new Float32Array([0, 0.5, -0.5, 1, -1]));
    const a = encodeFrame({ type: "audio", index: 3, sampleRate: 24000, samples: 5, durationMs: 1 }, pcm);
    const d = encodeFrame({ type: "done", count: 1 });
    const all = new Uint8Array([...a, ...d]);
    const dec = new FrameDecoder();
    const got = [];
    for (let i = 0; i < all.length; i += 3) got.push(...dec.push(all.subarray(i, i + 3)));
    expect(got).toHaveLength(2);
    expect(got[0]!.header).toEqual({ type: "audio", index: 3, sampleRate: 24000, samples: 5, durationMs: 1 });
    expect(Array.from(got[0]!.pcm!)).toEqual([0, 16383, -16384, 32767, -32768]);
    expect(got[1]!.header).toEqual({ type: "done", count: 1 });
  });
});
