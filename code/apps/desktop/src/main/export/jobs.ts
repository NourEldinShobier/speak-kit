import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExportJob, ExportRequest } from "@speakkit/protocol";
import { safeFileName, type ExportOptions, type ExportTarget, type ExportView } from "../../shared/export";
import { splitSentences } from "../../shared/reader";
import { parseWav, type Wav } from "@speakkit/engine";

/** The export routes of the server, as ExportJobs uses them. */
export interface ExportServer {
  startExport(req: ExportRequest): Promise<ExportJob>;
  exportStatus(id: string): Promise<ExportJob>;
  exportAudio(id: string, signal?: AbortSignal): Promise<Uint8Array>;
  cancelExport(id: string): Promise<void>;
}

export interface ExportDeps {
  server: ExportServer;
  /** Encodes off the main thread. Rejects with an AbortError when the signal aborts. */
  mp3(wav: Wav, kbps: number, onProgress: (f: number) => void, signal: AbortSignal): Promise<Uint8Array>;
  /** Called whenever any export changes. */
  onChange(views: ExportView[]): void;
  onDone(view: ExportView): void;
  pollMs?: number;
}

/** Silence between sentences in the rendered file. */
const GAP_MS = 250;

/** Where a file would go, and a free name beside it. */
export async function targetFor(dir: string, rawName: string, ext: "wav" | "mp3"): Promise<ExportTarget> {
  const base = safeFileName(rawName);
  const file = path.join(dir, `${base}.${ext}`);
  const exists = await stat(file).then(() => true, () => false);
  let alternative = file;
  for (let n = 2; (await stat(alternative).then(() => true, () => false)); n++) alternative = path.join(dir, `${base} (${n}).${ext}`);
  return { path: file, exists, alternative };
}

/** Runs exports: render on the server, fetch the WAV, encode MP3 in a worker when asked, save atomically. Several can run at once. */
export class ExportJobs {
  #d: ExportDeps;
  #views: ExportView[] = [];
  #aborts = new Map<string, AbortController>();
  #next = 1;

  constructor(deps: ExportDeps) {
    this.#d = deps;
  }

  get views(): readonly ExportView[] {
    return this.#views;
  }

  /** Starts a job and returns its view at once; the work continues in the background. */
  async start(o: ExportOptions): Promise<ExportView> {
    const sentences = splitSentences(o.text);
    if (!sentences.length) throw new Error("There is no text to export.");
    const ext = o.format;
    const target = await targetFor(o.dir, o.name, ext);
    if (target.exists && !o.conflict) throw new Error("A file with that name already exists.");
    const file = o.conflict === "keep-both" ? target.alternative : target.path;
    const view: ExportView = { id: `x${this.#next++}`, name: path.basename(file), stage: "rendering", progress: 0, done: 0, total: sentences.length };
    const ac = new AbortController();
    this.#aborts.set(view.id, ac);
    this.#views = [view, ...this.#views].slice(0, 8);
    this.#d.onChange(this.#views);
    void this.#run(view, ac, { sentences, voice: o.voice, speed: o.speed }, file, o.format, o.mp3Kbps);
    return { ...view };
  }

  async cancel(id: string): Promise<void> {
    this.#aborts.get(id)?.abort();
  }

  cancelAll() {
    for (const ac of this.#aborts.values()) ac.abort();
  }

  #patch(view: ExportView, p: Partial<ExportView>) {
    Object.assign(view, p);
    this.#views = [...this.#views];
    this.#d.onChange(this.#views);
  }

  async #run(view: ExportView, ac: AbortController, req: Omit<ExportRequest, "gapMs">, file: string, format: "wav" | "mp3", kbps: number) {
    const { signal } = ac;
    const part = `${file}.part`;
    let serverId: string | undefined;
    try {
      let job = await this.#d.server.startExport({ ...req, gapMs: GAP_MS });
      serverId = job.id;
      const poll = this.#d.pollMs ?? 250;
      while (job.state === "running") {
        this.#patch(view, { done: job.done, progress: (job.total ? job.done / job.total : 0) * (format === "mp3" ? 0.7 : 0.95), durationMs: job.durationMs });
        await new Promise((r) => setTimeout(r, poll));
        if (signal.aborted) throw new DOMException("cancelled", "AbortError");
        job = await this.#d.server.exportStatus(job.id);
      }
      if (job.state === "error") throw new Error(job.error ?? "The server could not render the audio.");
      if (job.state === "cancelled") throw new DOMException("cancelled", "AbortError");
      let bytes = await this.#d.server.exportAudio(job.id, signal);
      if (format === "mp3") {
        this.#patch(view, { stage: "encoding", progress: 0.7, done: job.total });
        bytes = await this.#d.mp3(parseWav(bytes), kbps, (f) => this.#patch(view, { progress: 0.7 + f * 0.28 }), signal);
      }
      this.#patch(view, { stage: "saving", progress: 0.98 });
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(part, bytes);
      await rename(part, file);
      this.#patch(view, { stage: "done", progress: 1, path: file, bytes: bytes.length, durationMs: job.durationMs });
      this.#d.onDone(view);
    } catch (e) {
      await rm(part, { force: true });
      if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) this.#patch(view, { stage: "cancelled" });
      else this.#patch(view, { stage: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      this.#aborts.delete(view.id);
      if (serverId) await this.#d.server.cancelExport(serverId).catch(() => {}); // frees the server's copy
    }
  }
}
