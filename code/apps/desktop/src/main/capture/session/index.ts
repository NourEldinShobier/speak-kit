import { noticeFor, noticeOfError, type Notice, type NoticeParams } from "../../../shared/capture/notices";
import type { Rect } from "../autocrop";
import type { Journal } from "../journal";
import type { Frame } from "../keyframes";
import type { Word } from "../narration";
import type { PickResult } from "../picker";
import type { CaptureRecord } from "../store";

export type Phase = "idle" | "picking" | "recording" | "finishing";
export type FinishStep = "video" | "words" | "saving";

export type Target = PickResult;

/** What the recorder hands back after it flushed the video to disk. */
export interface Media {
  durationMs: number;
  frames: Frame[];
  videoFile?: string | undefined;
  /** Microphone track, 16 kHz. Missing when there was no microphone. */
  pcm?: Int16Array | undefined;
  /** The video encoder fell back to the processor. */
  softwareEncoder?: boolean;
  windowRect?: Rect;
}

export interface SessionState {
  phase: Phase;
  id?: string;
  step?: FinishStep;
  target?: Target;
  startedAt?: number;
  /** Number of video segments so far; a target switch starts a new one. */
  segments?: number;
}

export interface SessionPorts {
  newId(): string;
  now(): number;
  /** Shows the picker; resolves null when it was cancelled. `signal` aborts it from outside. */
  pick(signal: AbortSignal): Promise<Target | null>;
  startRecording(id: string, target: Target): Promise<void>;
  switchTarget(id: string, target: Target): Promise<void>;
  stopRecording(id: string): Promise<Media>;
  /** Stops without keeping anything. Must not throw. */
  abortRecording(id: string): Promise<void>;
  /** Words of the microphone track, or null when none could be made (no model, no sound). */
  transcribe(media: Media): Promise<Word[] | null>;
  save(id: string, media: Media, words: Word[] | null): Promise<CaptureRecord>;
  /** Removes the folder of a capture that is not kept. */
  discard(id: string): Promise<void>;
  journal: Pick<Journal, "begin" | "stage">;
  notify(n: Notice): void;
  changed(s: SessionState): void;
  log(line: string): void;
  noticeParams?(): NoticeParams;
}

export type StartResult = { ok: true } | { ok: false; reason: "busy" | "finishing" | "cancelled" | "failed" };

export interface Session {
  readonly state: SessionState;
  /** `target` skips the picker (a saved choice). */
  start(target?: Target): Promise<StartResult>;
  /** Returns at once; the video is flushed, the words made and the bundle saved in the background. */
  stop(): void;
  /** Throws the recording away. Returns at once, from any phase, and leaves the app idle. */
  discard(): void;
  switchTarget(target: Target): Promise<boolean>;
  /** Resolves when nothing is running. */
  idle(): Promise<void>;
}

/**
 * One capture at a time: pick, record, then finish in order (video, words, save), each step written to the journal before the next starts. Stop and
 * discard return at once. A recording with no frames fails loudly instead of saving an empty capture. Every path ends in "idle".
 */
export function createSession(ports: SessionPorts): Session {
  return new SessionImpl(ports);
}

class SessionImpl implements Session {
  state: SessionState = { phase: "idle" };
  #p: SessionPorts;
  #abort: AbortController | undefined;
  #work: Promise<void> = Promise.resolve();
  #aborting: Promise<void> | undefined;

  constructor(ports: SessionPorts) {
    this.#p = ports;
  }

  #set(s: SessionState) {
    this.state = s;
    this.#p.changed(s);
  }

  #idle() {
    this.#set({ phase: "idle" });
  }

  /** True while the capture `id` is still in `phase`; reads the state afresh, because it changes while a port call is awaited. */
  #still(id: string, phase: Phase): boolean {
    const s: SessionState = this.state;
    return s.id === id && s.phase === phase;
  }

  #notify(code: Parameters<typeof noticeFor>[0]) {
    this.#p.notify(noticeFor(code, this.#p.noticeParams?.()));
  }

  #fail(e: unknown, id: string) {
    this.#p.log(`capture ${id} failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    this.#p.notify(noticeOfError(e, this.#p.noticeParams?.()));
  }

  /** Runs a step that must not break the capture: a failure is logged and the fallback is used. */
  async #soft<T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (e) {
      this.#p.log(`capture ${what}: ${e instanceof Error ? e.message : String(e)}`);
      return fallback;
    }
  }

  async start(preset?: Target): Promise<StartResult> {
    if (this.state.phase === "finishing") {
      this.#notify("still-saving");
      return { ok: false, reason: "finishing" };
    }
    if (this.state.phase !== "idle") return { ok: false, reason: "busy" };
    // A recording that was just discarded is still being stopped: a new one must not start under it.
    if (this.#aborting) {
      await this.#aborting;
      if (this.state.phase !== "idle") return { ok: false, reason: "busy" };
    }
    const id = this.#p.newId();
    const target = preset ?? (await this.#pick(id));
    if (!target) return { ok: false, reason: "cancelled" };
    this.#set({ phase: "picking", id, target });
    try {
      await this.#p.journal.begin(id, this.#p.now());
      await this.#p.startRecording(id, target);
    } catch (e) {
      await this.#throwAway(id);
      this.#fail(e, id);
      this.#idle();
      return { ok: false, reason: "failed" };
    }
    if (!this.#still(id, "picking")) {
      await this.#throwAway(id);
      return { ok: false, reason: "cancelled" };
    }
    this.#set({ phase: "recording", id, target, startedAt: this.#p.now(), segments: 1 });
    return { ok: true };
  }

  /** The picker: null when cancelled, closed, failed, or discarded while it was open. */
  async #pick(id: string): Promise<Target | null> {
    const ctl = new AbortController();
    this.#abort = ctl;
    this.#set({ phase: "picking", id });
    const picked = await this.#soft("picker", () => this.#p.pick(ctl.signal), null);
    if (ctl.signal.aborted || !this.#still(id, "picking")) {
      if (this.state.id === id) this.#idle();
      return null;
    }
    if (!picked) {
      this.#idle();
      this.#notify("cancelled");
    }
    return picked;
  }

  async #throwAway(id: string) {
    await this.#p.abortRecording(id);
    await this.#soft("discard", () => this.#p.discard(id), undefined);
  }

  stop() {
    const { phase, id } = this.state;
    if (phase !== "recording" || !id) return;
    this.#set({ ...this.state, phase: "finishing", step: "video" });
    this.#work = this.#finish(id);
  }

  async #finish(id: string) {
    try {
      const media = await this.#p.stopRecording(id);
      if (media.frames.length === 0 && !media.videoFile) {
        await this.#soft("discard", () => this.#p.discard(id), undefined);
        this.#notify("nothing-recorded");
        return;
      }
      await this.#p.journal.stage(id, "media-saved", media.videoFile ?? media.frames[0]?.file);
      const words = await this.#words(id, media);
      await this.#p.journal.stage(id, "words-saved");
      this.#set({ ...this.state, step: "saving" });
      await this.#p.save(id, media, words);
      await this.#p.journal.stage(id, "complete");
      if (media.softwareEncoder) this.#notify("software-encoder");
    } catch (e) {
      this.#fail(e, id);
    } finally {
      this.#idle();
    }
  }

  async #words(id: string, media: Media): Promise<Word[] | null> {
    this.#set({ ...this.state, step: "words" });
    const words = await this.#soft(`words of ${id}`, () => this.#p.transcribe(media), null);
    if (media.pcm && !words?.length) this.#notify("no-words");
    return words;
  }

  discard() {
    const { phase, id } = this.state;
    if (phase === "idle" || phase === "finishing") return;
    this.#abort?.abort();
    this.#idle();
    if (phase === "recording" && id) {
      const abort: Promise<void> = this.#throwAway(id).finally(() => {
        if (this.#aborting === abort) this.#aborting = undefined;
      });
      this.#aborting = this.#work = abort;
    }
  }

  async switchTarget(target: Target): Promise<boolean> {
    const { phase, id } = this.state;
    if (phase !== "recording" || !id) return false;
    try {
      await this.#p.switchTarget(id, target);
    } catch (e) {
      this.#fail(e, id);
      return false;
    }
    if (this.#still(id, "recording")) this.#set({ ...this.state, target, segments: (this.state.segments ?? 1) + 1 });
    return true;
  }

  async idle() {
    await this.#work;
  }
}
