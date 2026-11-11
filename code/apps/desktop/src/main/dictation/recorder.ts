import type { IpcMain, IpcMainEvent, WebContents } from "electron";
import * as v from "valibot";
import type { Clip, MicErrorCode, Recorder } from "@speakkit/dictation";
import { REC_COMMAND, REC_LEVEL, REC_READY, REC_REPLY } from "../../shared/dictation/channels";
import { RecorderReplySchema, type RecorderCommand, type RecorderResult } from "../../shared/dictation/contract";

/** What the recorder host needs of its window: a page it can send commands to. */
export interface RecorderPage {
  readonly contents: WebContents;
  destroy(): void;
  readonly destroyed: boolean;
}

interface Deps {
  ipcMain: IpcMain;
  open(): RecorderPage;
  /** Level 0..1 while recording, for the HUD. */
  onLevel(level: number): void;
  /** How long to wait for the page to load and for an answer. */
  timeoutMs?: number;
}

export interface RecorderHost extends Recorder {
  /** Creates the window and waits for its page; later `start` calls open the microphone only. Safe to call again. */
  prepare(): Promise<boolean>;
  /** Destroys the window (the microphone closes with it). */
  close(): void;
  owns(contents: WebContents): boolean;
  dispose(): void;
}

type Command = RecorderCommand extends infer C ? (C extends { id: number } ? Omit<C, "id"> : never) : never;
const FAILED: RecorderResult = { ok: false, code: "mic-failed" };
const fail = (code: MicErrorCode): { ok: false; code: MicErrorCode } => ({ ok: false, code });

/**
 * The `Recorder` port of dictation: the microphone lives in a hidden renderer (getUserMedia and an AudioWorklet at 16 kHz mono) and main talks to it
 * with numbered commands. Every command has a deadline, so a stuck page turns into "microphone failed" instead of a recording that never ends.
 */
class Host implements RecorderHost {
  readonly #d: Deps;
  readonly #timeoutMs: number;
  readonly #waiting = new Map<number, (r: RecorderResult) => void>();
  readonly #listeners: [string, (e: IpcMainEvent, ...a: unknown[]) => void][];
  #page: RecorderPage | undefined;
  #ready: Promise<boolean> | undefined;
  #markReady: (() => void) | undefined;
  #next = 1;

  constructor(deps: Deps) {
    this.#d = deps;
    this.#timeoutMs = deps.timeoutMs ?? 10_000;
    this.#listeners = [
      [REC_READY, (e) => this.#mine(e) && this.#markReady?.()],
      [REC_REPLY, (e, ...args) => this.#onReply(e, args)],
      [REC_LEVEL, (e, level) => this.#mine(e) && typeof level === "number" && Number.isFinite(level) && this.#d.onLevel(Math.min(1, Math.max(0, level)))],
    ];
    for (const [channel, fn] of this.#listeners) deps.ipcMain.on(channel, fn);
  }

  #mine(e: IpcMainEvent): boolean {
    return !!this.#page && !this.#page.destroyed && e.sender === this.#page.contents;
  }

  #onReply(e: IpcMainEvent, args: unknown[]): void {
    const parsed = v.safeParse(RecorderReplySchema, args);
    if (!this.#mine(e) || !parsed.success) return;
    const [id, result] = parsed.output;
    this.#waiting.get(id)?.(result);
  }

  prepare(): Promise<boolean> {
    if (this.#ready && this.#page && !this.#page.destroyed) return this.#ready;
    const page = (this.#page = this.#d.open());
    const ready = (this.#ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), this.#timeoutMs);
      this.#markReady = () => {
        clearTimeout(timer);
        resolve(true);
      };
    }));
    // A page that never signalled is dropped, so the next recording opens a fresh one.
    void ready.then((ok) => !ok && this.#page === page && this.close());
    page.contents.once("destroyed", () => this.#gone(page));
    return ready;
  }

  #gone(page: RecorderPage): void {
    if (this.#page === page) this.#page = undefined;
    for (const settle of this.#waiting.values()) settle(FAILED);
  }

  async #call(cmd: Command): Promise<RecorderResult> {
    if (!(await this.prepare()) || !this.#page || this.#page.destroyed) return FAILED;
    const page = this.#page;
    const id = this.#next++;
    return new Promise<RecorderResult>((resolve) => {
      const done = (r: RecorderResult) => {
        clearTimeout(timer);
        this.#waiting.delete(id);
        resolve(r);
      };
      const timer = setTimeout(() => done(FAILED), this.#timeoutMs);
      this.#waiting.set(id, done);
      page.contents.send(REC_COMMAND, { ...cmd, id });
    });
  }

  async start({ prerollMs }: { prerollMs: number }) {
    const r = await this.#call({ op: "start", prerollMs });
    return r.ok ? ({ ok: true } as const) : fail(r.code);
  }

  async stop(): Promise<Clip> {
    const r = await this.#call({ op: "stop" });
    if (!r.ok || !r.pcm || !r.sampleRate) throw new Error("the microphone window returned no audio");
    return { pcm: r.pcm, sampleRate: r.sampleRate, peak: r.peak ?? 0, ...(r.interrupted && { interrupted: true }) };
  }

  async discard(): Promise<void> {
    await this.#call({ op: "discard" });
  }

  close(): void {
    this.#page?.destroy();
    this.#page = undefined;
    this.#ready = undefined;
  }

  owns(contents: WebContents): boolean {
    return !!this.#page && !this.#page.destroyed && this.#page.contents === contents;
  }

  dispose(): void {
    for (const [channel, fn] of this.#listeners) this.#d.ipcMain.off(channel, fn);
    this.close();
  }
}

/** The microphone port over a hidden page; see `Host`. */
export const createRecorderHost = (deps: Deps): RecorderHost => new Host(deps);
