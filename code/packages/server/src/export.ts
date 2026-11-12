import { randomBytes } from "node:crypto";
import { createReadStream, rmSync } from "node:fs";
import { mkdir, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FileHandle } from "node:fs/promises";
import type { Readable } from "node:stream";
import { SAMPLE_RATE, type ExportJob } from "@speakkit/protocol";
import { wavHeader, type SynthOptions, type Synthesized, type TtsEngine } from "@speakkit/engine";

const MAX_JOBS = 16;
const KEEP_MS = 60 * 60_000;

interface Job extends ExportJob {
  ac: AbortController;
  file: string;
  finishedAt?: number;
  settled: Promise<void>;
}

interface ExportInput {
  sentences: string[];
  voice: string;
  speed: number;
  gapMs: number;
}
interface ExportDeps {
  /** Waits for a synthesis slot; resolves to its release function, rejects with the signal's reason if aborted while queued. */
  acquireSlot(ac: AbortController): Promise<() => void>;
  /** Normalizes the sentence and synthesizes it (silence when nothing readable is left). */
  render(engine: TtsEngine, sentence: string, opts: SynthOptions): Promise<Synthesized>;
  /** Opens the output file; tests inject a failing one. Default `fs/promises` open. */
  open?: typeof open;
}

export class ExportFullError extends Error {}

/**
 * Renders sentence lists to WAV files in `<dir>`, one job at a time per synthesis slot. The file is written as the sentences
 * finish (header patched at the end), so progress is readable while it runs and the finished file is served with its real length.
 */
export class ExportManager {
  #dir: string;
  #deps: ExportDeps;
  #jobs = new Map<string, Job>();

  constructor(dir: string, deps: ExportDeps) {
    this.#dir = dir;
    this.#deps = deps;
    // oxlint-disable-next-line node/no-sync -- startup, before the server listens
    rmSync(dir, { recursive: true, force: true }); // leftovers of a previous run
  }

  /** Fails with the signal's reason, creating nothing, when the request was abandoned (504) while the sweep ran. */
  async create(engine: TtsEngine, input: ExportInput, signal: AbortSignal): Promise<ExportJob> {
    await this.#sweep();
    signal.throwIfAborted();
    if (this.#jobs.size >= MAX_JOBS) throw new ExportFullError(`at most ${MAX_JOBS} exports at once; delete finished ones`);
    const id = randomBytes(8).toString("hex");
    const job = { id, state: "running", done: 0, total: input.sentences.length, durationMs: 0, sentenceMs: [] as [number, number][], ac: new AbortController(), file: join(this.#dir, `${id}.wav`) } as Job;
    job.settled = this.#run(job, engine, input);
    this.#jobs.set(id, job);
    return this.view(job);
  }

  get(id: string): Job | undefined {
    return this.#jobs.get(id);
  }

  view({ id, state, done, total, durationMs, sentenceMs, error }: Job): ExportJob {
    return { id, state, done, total, durationMs, ...(sentenceMs && { sentenceMs: [...sentenceMs] }), ...(error && { error }) };
  }

  /** Streams a finished WAV. */
  async audio(job: Job): Promise<{ stream: Readable; length: number }> {
    return { stream: createReadStream(job.file), length: (await stat(job.file)).size };
  }

  async cancel(id: string): Promise<boolean> {
    const job = this.#jobs.get(id);
    if (!job) return false;
    job.ac.abort(new Error("export cancelled"));
    await job.settled;
    this.#jobs.delete(id);
    await rm(job.file, { force: true });
    return true;
  }

  /** Aborts running jobs (engine switch, shutdown) without removing them. */
  abortAll(): void {
    for (const j of this.#jobs.values()) if (j.state === "running") j.ac.abort(new Error("export cancelled"));
  }

  async close(): Promise<void> {
    this.abortAll();
    await Promise.all([...this.#jobs.values()].map((j) => j.settled));
    await rm(this.#dir, { recursive: true, force: true });
  }

  async #sweep(): Promise<void> {
    const now = Date.now();
    const expired = [...this.#jobs].filter(([, j]) => j.finishedAt && now - j.finishedAt > KEEP_MS);
    for (const [id] of expired) this.#jobs.delete(id);
    await Promise.all(expired.map(([, j]) => rm(j.file, { force: true })));
  }

  async #run(job: Job, engine: TtsEngine, input: ExportInput): Promise<void> {
    const { signal } = job.ac;
    let release: (() => void) | undefined;
    let endStream: (() => void) | undefined;
    let fh: FileHandle | undefined;
    try {
      await mkdir(this.#dir, { recursive: true });
      fh = await (this.#deps.open ?? open)(job.file, "w");
      release = await this.#deps.acquireSlot(job.ac);
      endStream = engine.beginStream?.();
      await this.#render(job, { engine, input }, fh);
      job.state = "done";
    } catch (e) {
      job.state = signal.aborted ? "cancelled" : "error";
      if (!signal.aborted) job.error = e instanceof Error ? e.message : String(e);
    } finally {
      endStream?.();
      release?.();
      await fh?.close();
      job.finishedAt = Date.now();
    }
  }

  async #render(job: Job, { engine, input }: { engine: TtsEngine; input: ExportInput }, fh: FileHandle): Promise<void> {
    const { signal } = job.ac;
    await fh.write(wavHeader(SAMPLE_RATE, 0));
    let bytes = 0;
    let rate = 0;
    for (const [i, sentence] of input.sentences.entries()) {
      signal.throwIfAborted();
      const r = await this.#deps.render(engine, sentence, { voice: input.voice, speed: input.speed, signal });
      if (rate && r.sampleRate !== rate) throw new Error("engine changed sample rate during an export");
      rate = r.sampleRate;
      const startMs = Math.round((bytes / 2 / rate) * 1000);
      const gap = new Int16Array(i < input.sentences.length - 1 ? Math.round((rate * input.gapMs) / 1000) : 0);
      for (const part of [r.pcm, gap]) {
        await fh.write(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
        bytes += part.byteLength;
      }
      job.sentenceMs!.push([startMs, startMs + Math.round((r.pcm.length / rate) * 1000)]);
      job.done = i + 1;
      job.durationMs = Math.round((bytes / 2 / rate) * 1000);
    }
    await fh.write(wavHeader(rate || SAMPLE_RATE, bytes), 0, 44, 0);
  }
}
