import path from "node:path";
import {
  AUTOMATION_LIMITS,
  type AutomationExport,
  type AutomationExportRequest,
  type AutomationQueue,
  type AutomationSpeakRequest,
  type AutomationSpeakResult,
  type AutomationStatus,
} from "@speakkit/protocol";
import { AutomationFault, type AutomationHost } from "@speakkit/server";
import type { ExportView } from "../../shared/export";
import type { ReaderState } from "../../shared/reader";

/** The boundaries of the host: everything that touches the reader, the engine, dictation, the file system or the clock. */
export interface HostDeps {
  reader: {
    state(): ReaderState;
    /** Starts reading now, replacing the current reading; false when the text has nothing to say. */
    start(text: string): boolean;
    stop(): void;
  };
  split(text: string): string[];
  estimateMs(sentence: string): number;
  engineState(): string | undefined;
  /** Dictation is recording: the microphone and the speakers must not be used at once. */
  dictating(): boolean;
  exporter: { start(o: { text: string; dir: string; name: string; format: "wav" | "mp3" }): Promise<ExportView>; view(id: string): ExportView | undefined };
  now(): number;
  newId(): string;
}

interface Waiting {
  id: string;
  text: string;
  title: string;
  addedAtMs: number;
}

const TITLE_CHARS = 60;
const titleOf = (text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > TITLE_CHARS ? `${t.slice(0, TITLE_CHARS - 1).trimEnd()}…` : t;
};
const ended = (s: ReaderState["status"]) => s === "idle" || s === "finished" || s === "error";
const NOTHING_TO_READ = "there is nothing to read in that text";

const exportOf = (v: ExportView): AutomationExport => ({ id: v.id, stage: v.stage, progress: v.progress, ...(v.path && { path: v.path }), ...(v.error && { error: v.error.code }) });

/**
 * What scripts and AI apps may do with the reader: speak now or queue, stop, look at the queue, export a file, and follow the status.
 * One reading at a time; the waiting list is first in, first out and stops being read when the person presses stop.
 */
class Automation implements AutomationHost {
  readonly #d: HostDeps;
  readonly #waiting: Waiting[] = [];
  readonly #listeners = new Set<(s: AutomationStatus) => void>();
  #last: ReaderState["status"] = "idle";
  #skipping = false; // a stop we caused ourselves: the empty state that follows is not the person pressing stop

  constructor(deps: HostDeps) {
    this.#d = deps;
  }

  /** Wire this to the reader's state changes: the next waiting reading starts when one finishes or fails; a stop by the person empties the list. */
  onReader(state: ReaderState): void {
    const [prev, next] = [this.#last, state.status];
    this.#last = next;
    if (prev !== next && !this.#skipping) {
      if (next === "finished" || next === "error") this.#startNext();
      else if (next === "idle") this.#waiting.length = 0;
    }
    this.#emit();
  }

  status(): AutomationStatus {
    const r = this.#d.reader.state();
    return { status: r.status, title: r.title, index: r.index, total: r.total, elapsedMs: r.elapsedMs, totalMs: r.totalMs, queued: this.#waiting.length };
  }

  queue(): AutomationQueue {
    const r = this.#d.reader.state();
    return {
      current: r.status === "idle" ? null : { title: r.title, status: r.status, index: r.index, total: r.total },
      items: this.#waiting.map((w) => ({ id: w.id, title: w.title, chars: w.text.length, addedAtMs: w.addedAtMs })),
    };
  }

  async speak(req: AutomationSpeakRequest): Promise<AutomationSpeakResult> {
    const d = this.#d;
    const parts = d.split(req.text);
    if (!parts.length) throw new AutomationFault("invalid_input", NOTHING_TO_READ);
    const estimatedMs = parts.reduce((n, s) => n + d.estimateMs(s), 0);
    if (req.dryRun) return { id: "", position: 0, sentences: parts.length, estimatedMs, parts };
    this.#guardReady();
    const id = d.newId();
    if (req.mode === "queue" && !ended(d.reader.state().status)) {
      if (this.#waiting.length >= AUTOMATION_LIMITS.maxQueued) throw new AutomationFault("queue_full");
      this.#waiting.push({ id, text: req.text, title: titleOf(req.text), addedAtMs: d.now() });
      this.#emit();
      return { id, position: this.#waiting.length, sentences: parts.length, estimatedMs };
    }
    if (!d.reader.start(req.text)) throw new AutomationFault("invalid_input", NOTHING_TO_READ);
    return { id, position: 0, sentences: parts.length, estimatedMs };
  }

  stop(clear: boolean): AutomationStatus {
    this.#skipping = !clear && this.#waiting.length > 0;
    try {
      if (clear) this.#waiting.length = 0;
      this.#d.reader.stop();
      if (this.#skipping) this.#startNext();
    } finally {
      this.#skipping = false;
    }
    this.#emit();
    return this.status();
  }

  async startExport(req: AutomationExportRequest): Promise<AutomationExport> {
    const d = this.#d;
    const format = path.extname(req.out).toLowerCase().slice(1);
    if (format !== "mp3" && format !== "wav") throw new AutomationFault("invalid_input", "the output file must end in .mp3 or .wav");
    if (!path.isAbsolute(req.out)) throw new AutomationFault("invalid_input", "the output path must be absolute");
    if (!d.split(req.text).length) throw new AutomationFault("invalid_input", NOTHING_TO_READ);
    if (d.engineState() === "missing" || d.engineState() === "downloading") throw new AutomationFault("model_missing");
    return exportOf(await d.exporter.start({ text: req.text, dir: path.dirname(req.out), name: path.parse(req.out).name, format }));
  }

  exportStatus(id: string): AutomationExport | undefined {
    const v = this.#d.exporter.view(id);
    return v && exportOf(v);
  }

  subscribe(listener: (s: AutomationStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  #emit(): void {
    const s = this.status();
    for (const l of this.#listeners) l(s);
  }

  #startNext(): void {
    while (this.#waiting.length) {
      if (this.#d.reader.start(this.#waiting.shift()!.text)) return;
    }
  }

  #guardReady(): void {
    const engine = this.#d.engineState();
    if (engine === "missing" || engine === "downloading") throw new AutomationFault("model_missing");
    if (this.#d.dictating()) throw new AutomationFault("busy");
  }
}

export function createAutomationHost(d: HostDeps) {
  const a = new Automation(d);
  return { onReader: (state: ReaderState) => a.onReader(state), host: a as AutomationHost };
}
