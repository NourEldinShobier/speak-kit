import { RATE } from "./chunker";
import type { Outcome, TranscriptsDeps, Transcripts } from "./api";
import { encodeWav16k } from "./wav";
import { failures } from "./formats";
import type { Store } from "./store";
import { provisionalTitle } from "./title";
import type { Entry, Failure } from "./types";

export interface RecordingContext {
  d: TranscriptsDeps;
  store: Store;
  /** Samples spooled so far, by recording id. */
  spooled: Map<string, number>;
  settle(id: string, patch: Parameters<Store["update"]>[1]): Promise<Entry | undefined>;
  failure(e: unknown): Failure;
  enqueue(id: string): Outcome<{ position: number }>;
  run<T>(fn: () => Promise<T>): Promise<T>;
}

type Recording = Pick<Transcripts, "beginRecording" | "appendRecording" | "finishRecording" | "discardRecording">;

/** A microphone recording lives as a raw spool file while it runs, so a crash loses at most the last chunk; finishing turns the spool into the audio file and queues the job. */
export function recordingApi(c: RecordingContext): Recording & { finalizeSpool(id: string): Promise<Failure | undefined> } {
  const { d, store, spooled, settle, failure, enqueue, run } = c;
  /** The audio of a recording that never finished: what was spooled becomes the audio file. */
  async function finalizeSpool(id: string): Promise<Failure | undefined> {
    const raw = await d.fs.read(store.spoolPath(id));
    const even = raw ? raw.subarray(0, raw.length - (raw.length % 2)) : undefined;
    if (!even?.length) return failures.nothingRecorded();
    const pcm = new Int16Array(even.buffer.slice(even.byteOffset, even.byteOffset + even.length));
    try {
      await store.putAudio(id, encodeWav16k(pcm));
      await store.update(id, { durationSec: pcm.length / RATE });
      await d.fs.remove(store.spoolPath(id));
    } catch (err) {
      return failure(err);
    }
    return undefined;
  }

  return {
    finalizeSpool,
    beginRecording: (language) =>
      run(async () => {
        try {
          const e = await store.add({ title: provisionalTitle({ source: "microphone", at: d.now() }), source: "microphone", language, model: d.model(), status: "recording" });
          spooled.set(e.id, 0);
          return { ok: true, id: e.id };
        } catch (err) {
          return { ok: false, failure: failure(err) };
        }
      }),
    async appendRecording(id, pcm) {
      if (!spooled.has(id)) return { ok: false, failure: failures.failed() };
      try {
        await d.fs.append(store.spoolPath(id), new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
      } catch (err) {
        return { ok: false, failure: failure(err) };
      }
      const n = spooled.get(id)! + pcm.length;
      spooled.set(id, n);
      return { ok: true, seconds: n / RATE };
    },
    finishRecording: (id) =>
      run(async () => {
        const e = store.get(id);
        if (!e || e.status !== "recording") return { ok: false, failure: failures.failed() };
        spooled.delete(id);
        const bad = await finalizeSpool(id);
        if (bad) {
          await settle(id, { status: "failed", failure: bad });
          return { ok: false, failure: bad };
        }
        await settle(id, { status: "queued" });
        const q = enqueue(id);
        if (!q.ok) {
          await settle(id, { status: "failed", failure: q.failure });
          return q;
        }
        return { ok: true, id };
      }),
    discardRecording: (id) =>
      run(async () => {
        spooled.delete(id);
        await store.remove(id);
      }),
  };
}
