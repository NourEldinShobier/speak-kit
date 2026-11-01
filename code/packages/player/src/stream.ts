import type { ReadDoc } from "@speakkit/protocol";
import { readChunk } from "./chunk";
import type { PlayerDeps } from "./deps";
import { withLoadWait } from "./load-wait";
import type { AudioOutput } from "./output";
import { playbackRateFor } from "./rate";
import type { Scheduler } from "./scheduler";
import type { PlayerConfig } from "./types";

/** Max sentences per /v1/speak request (server limit is 500; smaller chunks bound work the server does ahead of us). */
const CHUNK = 40;

export interface StreamJob {
  doc: ReadDoc;
  cfg: PlayerConfig;
  deps: PlayerDeps;
  output: AudioOutput;
  sched: Scheduler;
  signal: AbortSignal;
  /** false once this stream was replaced or stopped */
  current: () => boolean;
  from: number;
  /** tell the server this request replaces the one just aborted (it does not count against the stream cap) */
  replace: boolean;
  onAudio: (index: number, pcm: Int16Array, sampleRate: number, durationMs: number) => void;
}

/** Requests the document from `from` on in chunks of CHUNK sentences, scheduling audio as it arrives. Resolves true when every sentence was requested, false when superseded. */
export async function runStream(j: StreamJob): Promise<boolean> {
  const { doc, current } = j;
  if (playbackRateFor(j.cfg.speed) > 1) {
    try {
      await j.output.ensureStretch();
    } catch {
      /* no worklet (blocked or unsupported): fall back to plain playbackRate, the pitch rises */
    }
    if (!current()) return false;
  }
  let next = j.from;
  while (next < doc.sentences.length) {
    const idxs: number[] = [];
    for (let i = next; i < doc.sentences.length && idxs.length < CHUNK; i++) if (doc.sentences[i]!.text.trim()) idxs.push(i);
    if (!idxs.length) break;
    await j.sched.room(current);
    if (!current()) return false;
    const replace = j.replace && next === j.from;
    const request = () =>
      readChunk({
        fetch: j.deps.fetch,
        cfg: j.cfg,
        doc,
        idxs,
        signal: j.signal,
        replace,
        current,
        room: () => j.sched.room(current),
        onAudio: j.onAudio,
      });
    await withLoadWait(request, { frames: () => j.sched.framesReceived, current, deps: j.deps });
    if (!current()) return false;
    next = idxs[idxs.length - 1]! + 1;
  }
  return current();
}
