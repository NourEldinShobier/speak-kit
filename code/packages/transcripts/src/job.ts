import { planChunks, RATE, type ChunkOptions } from "./chunker";
import { DiskFullError } from "./fs";
import { failures } from "./formats";
import type { Failure, Segment } from "./types";

export type ChunkResult = { ok: true; text: string; speech: boolean } | { ok: false; code: "engine-missing" | "engine-loading" | "failed" };

export interface JobDeps {
  transcribe(pcm: Int16Array, language: string, signal: AbortSignal): Promise<ChunkResult>;
  /** Resolves when dictation is not using the engine. Called before every chunk, so a dictation waits at most one chunk. Must resolve early when `signal` aborts. */
  clear?(signal: AbortSignal): Promise<void>;
  /** How long one chunk of this many seconds may take before the engine is taken to be hung. */
  deadlineMs?(sec: number): number;
  /** After every chunk, with all segments so far. The caller saves them: that is the checkpoint a resume starts from. */
  checkpoint?(done: number, total: number, segments: Segment[]): void | Promise<void>;
  chunks?: ChunkOptions;
}

export interface JobStart {
  pcm: Int16Array;
  language: string;
  /** Picks up after chunks already done (same audio, same plan). */
  resume?: { chunksDone: number; segments: Segment[] };
  /** Aborting with reason "quit" leaves the job resumable ("interrupted"); any other reason is a cancel. */
  signal: AbortSignal;
}

export interface JobResult {
  status: "done" | "cancelled" | "interrupted" | "failed";
  segments: Segment[];
  chunksDone: number;
  chunksTotal: number;
  failure?: Failure;
}

/** The reason a chunk is aborted with when the engine took too long: the caller then restarts the engine. */
export const HUNG = "transcription timed out";

const defaultDeadline = (sec: number) => 20_000 + Math.ceil(sec) * 6_000;

/**
 * Transcribes audio chunk by chunk and keeps what it has: a cancel, a quit or a failure returns the segments done so far with the number of chunks done, and a later
 * run with that `resume` continues from there. A chunk that fails is tried once more; a missing or still loading model stops the job at once. Every chunk waits for
 * `clear`, which is how dictation goes first.
 */
export async function runJob(deps: JobDeps, { pcm, language, resume, signal }: JobStart): Promise<JobResult> {
  const plan = planChunks(pcm, deps.chunks);
  const segments = [...(resume?.segments ?? [])];
  let done = Math.min(resume?.chunksDone ?? 0, plan.length);
  const result = (status: JobResult["status"], failure?: Failure): JobResult => ({ status, segments, chunksDone: done, chunksTotal: plan.length, ...(failure && { failure }) });
  const stopped = () => result(signal.reason === "quit" ? "interrupted" : "cancelled");

  for (; done < plan.length;) {
    if (signal.aborted) return stopped();
    await deps.clear?.(signal);
    if (signal.aborted) return stopped();
    const { from, to } = plan[done]!;
    const part = pcm.subarray(from, to);
    let r: ChunkResult = { ok: false, code: "failed" };
    for (let attempt = 0; attempt < 2 && !r.ok && r.code === "failed"; attempt++) {
      if (signal.aborted) return stopped();
      r = await once(deps, part, language, signal, (to - from) / RATE);
    }
    // A chunk that finished is kept even if the stop came while it ran; a failed one during a stop is just the stop.
    if (!r.ok && signal.aborted) return stopped();
    if (!r.ok) return result("failed", r.code === "engine-missing" ? failures.engineMissing() : r.code === "engine-loading" ? failures.engineLoading() : failures.failed());
    const text = r.speech ? r.text.trim() : "";
    if (text) segments.push({ start: from / RATE, end: to / RATE, text });
    done++;
    try {
      await deps.checkpoint?.(done, plan.length, segments);
    } catch (e) {
      // The chunk is not saved, so it is not done: a retry hears it again.
      done--;
      if (text) segments.pop();
      return result("failed", e instanceof DiskFullError ? failures.diskFull() : failures.failed());
    }
  }
  return result("done");
}

async function once(deps: JobDeps, part: Int16Array, language: string, signal: AbortSignal, sec: number): Promise<ChunkResult> {
  const own = new AbortController();
  const relay = () => own.abort(signal.reason);
  signal.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => own.abort(new Error(HUNG)), (deps.deadlineMs ?? defaultDeadline)(sec));
  try {
    return await deps.transcribe(part, language, own.signal);
  } catch {
    return { ok: false, code: "failed" };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", relay);
  }
}
