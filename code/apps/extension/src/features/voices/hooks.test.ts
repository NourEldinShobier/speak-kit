import { describe, expect, it } from "vite-plus/test";
import { VOICES_TTL_MS, isFresh } from "./hooks";

describe("voice list cache", () => {
  it("is trusted for 10 seconds, then refetched", () => {
    expect(VOICES_TTL_MS).toBe(10_000);
    expect(isFresh({ at: 1000 }, 10_999)).toBe(true);
    expect(isFresh({ at: 1000 }, 11_000)).toBe(false);
    expect(isFresh(undefined, 0)).toBe(false);
  });
});
