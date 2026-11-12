import type { IpcMain, IpcMainEvent, WebContents } from "electron";
import * as v from "valibot";
import type { Clip, MicErrorCode, Recorder } from "@speakkit/dictation";
import { REC_COMMAND, REC_EVENT, REC_LEVEL, REC_READY, REC_REPLY } from "../../shared/dictation/channels";
import type { Note } from "../../shared/dictation/sounds";
import { RecorderEventSchema, RecorderReplySchema, type RecorderCommand, type RecorderEvent, type RecorderMicConfig, type RecorderResult } from "../../shared/dictation/contract";

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
  /** Which microphone to use and how long to keep it open; read at every start. */
  mic(): RecorderMicConfig;
  /** The microphone itself went silent, was lost, or came back. */
  onEvent(e: RecorderEvent): void;
  /** How long to wait for the page to load and for an answer. */
  timeoutMs?: number;
}

export interface RecorderHost extends Recorder {
  /** Creates the window and waits for its page; later `start` calls open the microphone only. Safe to call again. */
  prepare(): Promise<boolean>;
  devices(): Promise<void>;
  /** Plays the notes on the speakers through the microphone window; nothing happens while that window is not open. */
  tone(notes: readonly Note[]): void;
  /** Applies the microphone settings now: the microphone is opened for the level meter or a kept-ready setting, and released when neither applies. */
  configure(meter: boolean): Promise<void>;
  /** Destroys the window (the microphone closes with it). */
  close(): void;
  owns(contents: WebContents): boolean;
  /** The microphone chosen at the last start, as the page reported it. */
  readonly device: { label: string; bluetooth: boolean } | undefined;
  /** True while the last block of audio was speech-loud: lets a recording run on a little after the key is released. */
  speaking(): boolean;
  dispose(): void;
}

type Command = RecorderCommand extends infer C ? (C extends { id: number } ? Omit<C, "id"> : never) : never;
/** A block this loud (see `levelOf`) is speech, not room noise. */
const SPEECH_LEVEL = 0.12;
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
  #disposed = false;
  #lastLevel = 0;
  #lastLevelAt = 0;
  device: { label: string; bluetooth: boolean } | undefined;

  constructor(deps: Deps) {
    this.#d = deps;
    this.#timeoutMs = deps.timeoutMs ?? 10_000;
    this.#listeners = [
      [REC_READY, (e) => this.#mine(e) && this.#markReady?.()],
      [REC_REPLY, (e, ...args) => this.#onReply(e, args)],
      [REC_LEVEL, (e, level) => this.#mine(e) && typeof level === "number" && Number.isFinite(level) && this.#onLevel(Math.min(1, Math.max(0, level)))],
      [REC_EVENT, (e, event) => this.#mine(e) && this.#onEvent(event)],
    ];
    for (const [channel, fn] of this.#listeners) deps.ipcMain.on(channel, fn);
  }

  #mine(e: IpcMainEvent): boolean {
    return !!this.#page && !this.#page.destroyed && e.sender === this.#page.contents;
  }

  #onLevel(level: number): void {
    this.#lastLevel = level;
    this.#lastLevelAt = Date.now();
    this.#d.onLevel(level);
  }

  #onEvent(event: unknown): void {
    const parsed = v.safeParse(RecorderEventSchema, event);
    if (parsed.success) this.#d.onEvent(parsed.output);
  }

  speaking(): boolean {
    return this.#lastLevel > SPEECH_LEVEL && Date.now() - this.#lastLevelAt < 200;
  }

  #onReply(e: IpcMainEvent, args: unknown[]): void {
    const parsed = v.safeParse(RecorderReplySchema, args);
    if (!this.#mine(e) || !parsed.success) return;
    const [id, result] = parsed.output;
    this.#waiting.get(id)?.(result);
  }

  prepare(): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);
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
    if (this.#disposed || !(await this.prepare()) || !this.#page || this.#page.destroyed) return FAILED;
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
    const r = await this.#call({ op: "start", prerollMs, mic: this.#d.mic() });
    if (r.ok) this.device = r.device;
    return r.ok ? ({ ok: true } as const) : fail(r.code);
  }

  async stop(): Promise<Clip> {
    const r = await this.#call({ op: "stop" });
    if (!r.ok || !r.pcm || !r.sampleRate) throw new Error("the microphone window returned no audio");
    return { pcm: r.pcm, sampleRate: r.sampleRate, peak: r.peak ?? 0, ...(r.interrupted && { interrupted: true }) };
  }

  tone(notes: readonly Note[]): void {
    if (notes.length === 0 || !this.#page || this.#page.destroyed) return;
    void this.#call({ op: "tone", notes: [...notes] });
  }

  /** Asks the page to list the microphones; the list comes back as an event. */
  async devices(): Promise<void> {
    await this.#call({ op: "devices" });
  }

  async configure(meter: boolean): Promise<void> {
    // Releasing needs no window: opening one just to say "let go" would also keep the app from quitting.
    if (!meter && (!this.#page || this.#page.destroyed)) return;
    await this.#call({ op: "configure", meter, mic: this.#d.mic() });
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
    this.#disposed = true;
    for (const [channel, fn] of this.#listeners) this.#d.ipcMain.off(channel, fn);
    this.close();
  }
}

/** The microphone port over a hidden page; see `Host`. */
export const createRecorderHost = (deps: Deps): RecorderHost => new Host(deps);
