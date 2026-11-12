import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Clip, Recorder } from "@speakkit/dictation";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { encodeWav } from "./audio-store";
import { createFixtureRecorder, readFixture } from "./fixture-recorder";

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

let dir = "";
afterEach(async () => dir && (await rm(dir, { recursive: true, force: true })));

describe("fixture recorder", () => {
  it("gives the file as each recording and never touches the microphone", async () => {
    const { mic, log } = fakeMic();
    const rec = createFixtureRecorder(mic, "x.wav", () => clip([0.5, -0.25]));
    expect(await rec.start({ prerollMs: 450 })).toEqual({ ok: true });
    expect(await rec.stop()).toEqual(clip([0.5, -0.25]));
    expect(await rec.start({ prerollMs: 0 })).toEqual({ ok: true });
    expect(await rec.stop()).toEqual(clip([0.5, -0.25]));
    expect(log).toEqual([]);
  });

  it("discards without calling the microphone", async () => {
    const { mic, log } = fakeMic();
    const rec = createFixtureRecorder(mic, "x.wav", () => clip([0.5]));
    await rec.start({ prerollMs: 0 });
    await rec.discard();
    expect(log).toEqual([]);
  });

  it("is never speaking, so the release tail ends at its minimum", () => {
    expect(createFixtureRecorder(fakeMic().mic, "x.wav", () => clip([0.5])).speaking?.()).toBe(false);
  });

  it("leaves the real microphone in charge when the file cannot be read", async () => {
    const { mic, log } = fakeMic();
    const rec = createFixtureRecorder(mic, "missing.wav", () => undefined);
    await rec.start({ prerollMs: 0 });
    await rec.stop();
    expect(log).toEqual(["start", "stop"]);
  });

  it("reads a real WAV file back to the same samples and its loudest sample", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "fixture-"));
    const file = path.join(dir, "a.wav");
    await writeFile(file, encodeWav(clip([0, 0.5, -0.5, 0])));
    const got = readFixture(file);
    expect(got?.sampleRate).toBe(16_000);
    expect(got?.peak).toBeCloseTo(0.5, 3);
    expect(got?.pcm.length).toBe(4);
    expect(readFixture(path.join(dir, "nope.wav"))).toBeUndefined();
    await writeFile(path.join(dir, "bad.wav"), "not a wav");
    expect(readFixture(path.join(dir, "bad.wav"))).toBeUndefined();
  });
});
