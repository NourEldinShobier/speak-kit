import { DiskFullError, encodeWav16k, RATE, type Fs } from "@speakkit/transcripts";
import type { Failure } from "./types";

export type TrackName = "you" | "them";

/** The longest silence one gap is padded with; a longer gap means the clock jumped (sleep), not that audio is missing. */
const MAX_PAD_SEC = 60;

const bytesOf = (pcm: Int16Array) => new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);

export interface TrackFiles {
  spool(track: TrackName): string;
  wav(track: TrackName): string;
}

export interface WriterOptions {
  fs: Fs;
  files: TrackFiles;
  sleep(ms: number): Promise<void>;
  /** Tries for a final file before giving up; waits grow 200 ms, 400 ms, ... */
  attempts?: number;
}

/**
 * The two tracks of a recording. Each is spooled to disk as raw samples while it runs, so a crash keeps what was heard, and both are kept on the same clock:
 * when a block arrives after a gap (an xrun, a stalled device) the gap is filled with silence, so You and Them always line up with each other and with the
 * meeting time. Finishing turns each spool into a WAV file, retried on failure; when it still fails the spool stays so the recording can be recovered or deleted.
 */
export class TrackWriter {
  readonly #o: WriterOptions;
  readonly #samples: Record<TrackName, number> = { you: 0, them: 0 };
  #queue: Promise<unknown> = Promise.resolve();

  constructor(o: WriterOptions) {
    this.#o = o;
  }

  seconds(track: TrackName): number {
    return this.#samples[track] / RATE;
  }

  /** Adds a block that starts `atSec` seconds into the meeting. Blocks run one at a time per writer, so order is kept. */
  append(track: TrackName, pcm: Int16Array, atSec: number): Promise<void> {
    const run = this.#queue.then(async () => {
      const gap = Math.round(atSec * RATE) - this.#samples[track];
      let data = pcm;
      if (gap > 0 && gap <= MAX_PAD_SEC * RATE) {
        data = new Int16Array(gap + pcm.length);
        data.set(pcm, gap);
      }
      if (!data.length) return;
      await this.#o.fs.append(this.#o.files.spool(track), bytesOf(data));
      this.#samples[track] += data.length;
    });
    this.#queue = run.catch(() => {});
    return run;
  }

  /** Writes the WAV of one track from its spool. `bytes` is 0 when the track recorded nothing. */
  async finish(track: TrackName): Promise<{ ok: true; bytes: number } | { ok: false; failure: Failure }> {
    await this.#queue;
    const raw = await this.#o.fs.read(this.#o.files.spool(track)).catch(() => undefined);
    const even = raw ? raw.subarray(0, raw.length - (raw.length % 2)) : undefined;
    if (!even?.length) return { ok: true, bytes: 0 };
    const pcm = new Int16Array(even.buffer.slice(even.byteOffset, even.byteOffset + even.length));
    const wav = encodeWav16k(pcm);
    const attempts = this.#o.attempts ?? 3;
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        await this.#o.fs.write(this.#o.files.wav(track), wav);
        await this.#o.fs.remove(this.#o.files.spool(track));
        return { ok: true, bytes: wav.length };
      } catch (e) {
        last = e;
        if (i < attempts - 1) await this.#o.sleep(200 * 2 ** i);
      }
    }
    const full = last instanceof DiskFullError;
    return {
      ok: false,
      failure: {
        code: full ? "disk-full" : "finalise-failed",
        message: full
          ? "The disk is full, so the recording could not be saved. The audio is kept; free some space and try again."
          : "The recording could not be finished. The audio recorded so far is kept.",
      },
    };
  }
}

/**
 * Loopback capture that survives an xrun: the stream is opened once and an interruption in it is a gap in time, filled with silence by the writer, never a
 * reason to open it again. Only the stream ending (the track ended, the device went away) asks for a reopen, and then at most once per `minGapMs`.
 */
export class LoopbackSupervisor {
  readonly #minGap: number;
  #lastReopen = -Infinity;
  xruns = 0;

  constructor(minGapMs = 5_000) {
    this.#minGap = minGapMs;
  }

  /** A glitch in a running stream. Counted; never a reopen. */
  xrun(): "keep" {
    this.xruns++;
    return "keep";
  }

  /** The stream ended. `reopen` unless one was just made, so a flapping device does not spin. */
  ended(now: number): "reopen" | "wait" {
    if (now - this.#lastReopen < this.#minGap) return "wait";
    this.#lastReopen = now;
    return "reopen";
  }
}
