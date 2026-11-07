import { describe, expect, it } from "vite-plus/test";
import { asPlayerState } from "./player-state";

const state = { status: "playing", sentenceIndex: 2, sentenceCount: 9, elapsedMs: 1200, totalMs: 9000, speed: 1.2, voice: "af_heart", queueLength: 0 };

describe("asPlayerState", () => {
  it("passes a well-formed state through", () => {
    expect(asPlayerState(state)).toEqual(state);
  });

  it.each([undefined, null, "playing", {}, { ...state, status: "asleep" }, { ...state, sentenceIndex: "2" }])("rejects %j", (bad) => {
    expect(asPlayerState(bad)).toBeUndefined();
  });
});
