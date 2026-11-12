import type { Clip, Recorder } from "@speakkit/dictation";
import { describe, expect, it } from "vite-plus/test";
import { createFixtureRecorder } from "./fixture-recorder";

const clip = (pcm: number[]): Clip => ({ pcm: new Float32Array(pcm), sampleRate: 16_000, peak: 0 });

function fakeMic() {
  const log: string[] = [];
  const mic: Recorder = {
    async start() {
      log.push("start");
      return { ok: true };
    },
    async stop() {
      log.push("stop");
      return clip([0.1]);
    },
    async discard() {
      log.push("discard");
    },
  };
  return { mic, log };
}

describe("fixture recorder edge cases", () => {
  it("fails the recording when the file disappears between start and stop", async () => {
    let reads = 0;
    const rec = createFixtureRecorder(fakeMic().mic, "x.wav", async () => (reads++ === 0 ? clip([0.5]) : undefined));
    await rec.start({ prerollMs: 0 });
    await expect(rec.stop()).rejects.toThrow("the fixture file cannot be read");
  });

  it("goes back to the microphone for a stop that was not started on the fixture", async () => {
    const { mic, log } = fakeMic();
    const rec = createFixtureRecorder(mic, "x.wav", async () => clip([0.5]));
    await rec.start({ prerollMs: 0 });
    await rec.stop();
    await rec.stop();
    expect(log).toEqual(["stop"]);
  });

  it("goes back to the microphone after a discarded fixture take", async () => {
    const { mic, log } = fakeMic();
    const rec = createFixtureRecorder(mic, "x.wav", async () => clip([0.5]));
    await rec.start({ prerollMs: 0 });
    await rec.discard();
    await rec.discard();
    await rec.stop();
    expect(log).toEqual(["discard", "stop"]);
  });
});
