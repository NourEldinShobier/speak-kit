import { describe, expect, it } from "vite-plus/test";
import { AUDIO_LAG_MS, transcribeTrack } from "./recording";
import type { Media } from "./session";

const media = (pcm: Int16Array | undefined): Media => ({ durationMs: 1000, frames: [], videoFile: undefined, pcm });
const narrator = (text: string) => ({ ready: () => true, transcribe: async () => text });

describe("words of a track", () => {
  it("takes the words the live narration made, moved back by the microphone lag", async () => {
    const live = { begin() {}, push() {}, cancel() {}, active: () => true, finish: async () => [{ text: "hi", startMs: 1000, endMs: 1500 }] };
    const words = await transcribeTrack({ narrator: narrator("never used"), log: () => undefined, live }, media(undefined));
    expect(words).toEqual([{ text: "hi", startMs: 1000 - AUDIO_LAG_MS, endMs: 1500 - AUDIO_LAG_MS }]);
  });

  it("gives none when the live narration heard nothing, without running the model over the track again", async () => {
    let asked = 0;
    const live = { begin() {}, push() {}, cancel() {}, active: () => true, finish: async () => null };
    const n = { ready: () => true, transcribe: async () => (asked++, "x") };
    expect(await transcribeTrack({ narrator: n, log: () => undefined, live }, media(new Int16Array(16_000).fill(3000)))).toBeNull();
    expect(asked).toBe(0);
  });

  it("transcribes the whole track afterwards when no live narration runs", async () => {
    const live = { begin() {}, push() {}, cancel() {}, active: () => false, finish: async () => null };
    const words = await transcribeTrack({ narrator: narrator("hello"), log: () => undefined, live }, media(new Int16Array(16_000).fill(3000)));
    expect(words?.map((w) => w.text)).toEqual(["hello"]);
  });
});
