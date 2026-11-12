import { failures, MAX_HOURS, type Failure, type Outcome, type Transcripts } from "@speakkit/transcripts";
import type { MicResult, RecordingView } from "../../shared/transcripts/contract";

/** The microphone page: opens the device and streams 16 kHz mono samples. */
export interface MicPort {
  start(): Promise<MicResult>;
  stop(): Promise<void>;
  onChunk(cb: (pcm: Int16Array) => void): void;
  onLevel(cb: (level: number) => void): void;
  /** The device went away (unplugged, taken by another program). */
  onEnded(cb: () => void): void;
}

type Store = Pick<Transcripts, "beginRecording" | "appendRecording" | "finishRecording" | "discardRecording">;

export interface SessionDeps {
  mic: MicPort;
  transcripts: Store;
  language(): string;
  now(): number;
  /** The view for the window, or null when nothing is recording. */
  changed(view: RecordingView | null): void;
  /** Something the person should hear about that ended the recording by itself. */
  notice(text: string): void;
  maxSeconds?: number;
  /** Seconds without sound before the window says so. */
  silentAfterSec?: number;
}

const MIC_MESSAGES: Record<string, string> = {
  "mic-denied": "Speak Kit cannot use the microphone. Allow it in your system's privacy settings and try again.",
  "mic-missing": "No microphone was found. Connect one and try again.",
  "mic-busy": "The microphone is in use by another program. Close it and try again.",
  "mic-failed": "The microphone could not be opened. Try again.",
};
const SOUND = 0.02;
/** Shorter than this is a slip of the button, not a recording. */
const MIN_SECONDS = 1;

/**
 * One manual recording at a time, microphone only. The samples go to disk as they arrive (the transcripts store spools them), so a crash or a power cut
 * loses at most the last chunk. The recording ends by itself, keeping what it has, when the disk is full, the device goes away or the time limit is reached.
 */
export class RecordingSession {
  readonly #d: SessionDeps;
  #id: string | undefined;
  #phase: RecordingView["phase"] | undefined;
  #seconds = 0;
  #level = 0;
  #lastSound = 0;
  #pending: Promise<unknown> = Promise.resolve();
  #ending: Promise<Outcome<{ id: string }>> | undefined;
  #endReason: string | undefined;

  constructor(deps: SessionDeps) {
    this.#d = deps;
    deps.mic.onChunk((pcm) => this.#chunk(pcm));
    deps.mic.onLevel((n) => {
      this.#level = n;
      if (n >= SOUND) this.#lastSound = deps.now();
    });
    deps.mic.onEnded(() => void this.#autoStop("The microphone was disconnected. What was recorded is saved."));
  }

  get active(): boolean {
    return this.#phase !== undefined;
  }

  view(): RecordingView | null {
    if (!this.#phase) return null;
    const silent = this.#phase === "recording" && this.#d.now() - this.#lastSound >= (this.#d.silentAfterSec ?? 10) * 1000;
    return { id: this.#id ?? null, phase: this.#phase, seconds: Math.floor(this.#seconds), level: this.#phase === "recording" ? this.#level : 0, silent };
  }

  #emit(): void {
    this.#d.changed(this.view());
  }

  async start(): Promise<Outcome<{ id: string }>> {
    if (this.#phase) return { ok: false, failure: { code: "failed", message: "A recording is already running." } };
    this.#phase = "starting";
    this.#seconds = 0;
    this.#level = 0;
    this.#endReason = undefined;
    this.#emit();
    const begun = await this.#d.transcripts.beginRecording(this.#d.language());
    if (!begun.ok) return this.#abandon(begun.failure);
    const id = (this.#id = begun.id);
    const mic = await this.#d.mic.start().catch((): MicResult => ({ ok: false, code: "mic-failed" }));
    if (!mic.ok) {
      await this.#d.transcripts.discardRecording(id);
      return this.#abandon({ code: "failed", message: MIC_MESSAGES[mic.code]! });
    }
    this.#lastSound = this.#d.now();
    this.#phase = "recording";
    this.#emit();
    return { ok: true, id };
  }

  #abandon(failure: Failure): { ok: false; failure: Failure } {
    this.#phase = undefined;
    this.#id = undefined;
    this.#emit();
    return { ok: false, failure };
  }

  #chunk(pcm: Int16Array): void {
    if (this.#phase !== "recording" || !this.#id) return;
    const id = this.#id;
    this.#pending = this.#pending.then(async () => {
      const r = await this.#d.transcripts.appendRecording(id, pcm);
      if (!r.ok) {
        void this.#autoStop(r.failure.code === "disk-full" ? "The disk is full. What was recorded so far is saved and is being transcribed." : "Recording stopped because it could not be saved. What was recorded so far is kept.");
        return;
      }
      this.#seconds = r.seconds;
      if (r.seconds >= (this.#d.maxSeconds ?? MAX_HOURS * 3600)) void this.#autoStop(`The ${MAX_HOURS} hour limit was reached. The recording is saved and is being transcribed.`);
      else this.#emit();
    });
  }

  #autoStop(reason: string): Promise<Outcome<{ id: string }>> {
    this.#endReason ??= reason;
    return this.stop();
  }

  /** Ends the recording and queues it. Safe to call twice: the second call waits for the first. */
  stop(): Promise<Outcome<{ id: string }>> {
    if (this.#ending) return this.#ending;
    if (this.#phase !== "recording" || !this.#id) return Promise.resolve({ ok: false, failure: { code: "failed", message: "Nothing is recording." } });
    const id = this.#id;
    this.#phase = "saving";
    this.#emit();
    this.#ending = (async () => {
      await this.#d.mic.stop().catch(() => {});
      await this.#pending;
      let result: Outcome<{ id: string }>;
      if (this.#seconds < MIN_SECONDS) {
        await this.#d.transcripts.discardRecording(id);
        result = { ok: false, failure: failures.nothingRecorded() };
        if (this.#endReason) this.#d.notice("Recording stopped before anything was saved.");
      } else {
        result = await this.#d.transcripts.finishRecording(id);
        if (this.#endReason) this.#d.notice(this.#endReason);
      }
      this.#phase = undefined;
      this.#id = undefined;
      this.#ending = undefined;
      this.#emit();
      return result;
    })();
    return this.#ending;
  }
}
