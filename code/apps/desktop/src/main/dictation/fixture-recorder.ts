import { readFile } from "node:fs/promises";
import type { Clip, Recorder } from "@speakkit/dictation";
import { parseWav } from "@speakkit/engine";

/** The clip of a WAV file, or undefined when it cannot be read. */
export async function readFixture(file: string): Promise<Clip | undefined> {
  try {
    const wav = parseWav(await readFile(file));
    return { pcm: wav.samples, sampleRate: wav.sampleRate, peak: wav.samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0) };
  } catch {
    return undefined;
  }
}

/**
 * A recorder that gives the audio of a WAV file in place of the microphone, for end-to-end tests: each recording is the whole file. A file that cannot
 * be read leaves the real microphone in charge, so a wrong path never turns into a silent test.
 */
export function createFixtureRecorder(mic: Recorder, file: string, read: (file: string) => Promise<Clip | undefined> = readFixture): Recorder {
  let live = false;
  return {
    async start(req) {
      if (!(await read(file))) return mic.start(req);
      live = true;
      return { ok: true };
    },
    async stop() {
      if (!live) return mic.stop();
      live = false;
      const clip = await read(file);
      if (!clip) throw new Error("the fixture file cannot be read");
      return clip;
    },
    async discard() {
      if (live) live = false;
      else await mic.discard();
    },
    speaking: () => false,
  };
}
