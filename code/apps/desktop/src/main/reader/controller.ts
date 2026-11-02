import type { PreviewAudio } from "../../shared/ipc";
import { estimateMs, IDLE_READER, splitSentences, titleOf, type ReaderCommand, type ReaderSource, type ReaderState } from "../../shared/reader";

/** Sentences synthesized ahead of the one playing. */
const AHEAD = 3;

interface ReaderDeps {
  /** One sentence to PCM through the local server. Must reject when the signal aborts. */
  synth(text: string, voice: string, speed: number, signal: AbortSignal): Promise<PreviewAudio>;
  voice(): string;
  speed(): number;
  /** State changed; every view (mini player, tray panel, main window) renders from it. */
  emit(state: ReaderState): void;
  /** The audio side. `epoch` changes on every seek so late callbacks can be ignored. */
  player: {
    chunk(epoch: number, index: number, audio: PreviewAudio): void;
    pause(): void;
    resume(): void;
    /** Drop everything queued and playing. */
    flush(): void;
  };
}

/**
 * One reading at a time: splits text into sentences, synthesizes a few ahead, hands the audio to the player and follows its
 * callbacks. Holds no audio itself, so a long text costs a few sentences of memory.
 */
export class ReaderController {
  #d: ReaderDeps;
  #sentences: string[] = [];
  #dur: (number | undefined)[] = [];
  #source: ReaderSource | null = null;
  #title = "";
  #voice = "";
  #speed = 1;
  #epoch = 0;
  #abort: AbortController | null = null;
  #cursor = 0; // next sentence to synthesize
  #playing = -1; // sentence the player reported as started
  #paused = false;
  #finished = false;
  #error: string | null = null;
  #pumpEpoch = -1;

  constructor(deps: ReaderDeps) {
    this.#d = deps;
  }

  #status(): ReaderState["status"] {
    if (this.#error) return "error";
    if (this.#finished) return "finished";
    if (this.#paused) return "paused";
    return this.#playing >= 0 ? "playing" : "preparing";
  }

  get state(): ReaderState {
    const total = this.#sentences.length;
    if (!total) return this.#error ? { ...IDLE_READER, status: "error", title: "Speak Kit", error: this.#error } : IDLE_READER;
    const status = this.#status();
    const index = Math.max(0, this.#playing);
    let before = 0;
    let all = 0;
    this.#sentences.forEach((s, i) => {
      const ms = this.#dur[i] ?? estimateMs(s, this.#speed);
      if (i < index || (this.#finished && i === index)) before += ms;
      all += ms;
    });
    return {
      status,
      source: this.#source,
      title: this.#title,
      index,
      total,
      elapsedMs: before,
      totalMs: all,
      next: this.#sentences[index + 1] ?? null,
      error: this.#error,
    };
  }

  /** Starts a new reading, replacing any current one. Returns false when the text has nothing to say. */
  start(text: string, source: ReaderSource): boolean {
    const sentences = splitSentences(text);
    this.#reset(false); // the next state replaces the old one without a flash of idle
    if (!sentences.length) {
      this.#d.emit(IDLE_READER);
      return false;
    }
    this.#sentences = sentences;
    this.#title = titleOf(text);
    this.#dur = [];
    this.#source = source;
    this.#voice = this.#d.voice();
    this.#speed = this.#d.speed();
    this.#begin(0);
    return true;
  }

  /** Shows an error without a reading (nothing selected, empty clipboard). Stop or the next start clears it. */
  fail(message: string): void {
    this.#reset(false);
    this.#error = message;
    this.#d.emit(this.state);
  }

  command(c: ReaderCommand): void {
    const st = this.state.status;
    switch (c.type) {
      case "toggle":
        if (st === "playing" || st === "preparing") this.command({ type: "pause" });
        else if (st === "paused") this.command({ type: "resume" });
        else if (st === "finished") this.command({ type: "replay" });
        return;
      case "pause":
        if (st !== "playing" && st !== "preparing") return;
        this.#paused = true;
        this.#d.player.pause();
        break;
      case "resume":
        if (st !== "paused") return;
        this.#paused = false;
        this.#d.player.resume();
        break;
      case "stop":
        this.#reset();
        break;
      case "keep-on-top":
      case "open-app":
        return; // window commands, handled by the reading service
      case "replay":
        if (!this.#sentences.length) return;
        this.#begin(0);
        return;
      case "step":
        if (!this.#sentences.length || this.#finished) return;
        this.#begin(Math.min(this.#sentences.length - 1, Math.max(0, this.#playing + c.by)));
        return;
      case "skip":
        if (!this.#sentences.length || this.#finished) return;
        this.#begin(this.#indexAt(this.state.elapsedMs + c.ms));
        return;
    }
    this.#d.emit(this.state);
  }

  /** The player started sentence `index`. */
  started(epoch: number, index: number): void {
    if (epoch !== this.#epoch) return;
    this.#playing = index;
    this.#d.emit(this.state);
    void this.#pump(epoch);
  }

  /** The player finished sentence `index`; the last one ends the reading. */
  done(epoch: number, index: number): void {
    if (epoch !== this.#epoch || index !== this.#sentences.length - 1) return;
    this.#finished = true;
    this.#d.emit(this.state);
  }

  #reset(announce = true) {
    this.#epoch++;
    this.#abort?.abort();
    this.#abort = null;
    this.#d.player.flush();
    this.#sentences = [];
    this.#dur = [];
    this.#source = null;
    this.#paused = false;
    this.#finished = false;
    this.#error = null;
    this.#playing = -1;
    this.#cursor = 0;
    if (announce) this.#d.emit(IDLE_READER);
  }

  /** (Re)start playback at a sentence: drops queued audio, keeps the paused flag. */
  #begin(index: number) {
    this.#epoch++;
    this.#abort?.abort();
    this.#abort = new AbortController();
    this.#d.player.flush();
    this.#cursor = index;
    this.#playing = -1;
    this.#finished = false;
    this.#error = null;
    this.#d.emit(this.state);
    void this.#pump(this.#epoch);
  }

  /** Start offset of the sentence containing `ms`, as an index. */
  #indexAt(ms: number): number {
    let at = 0;
    const last = this.#sentences.length - 1;
    for (let i = 0; i <= last; i++) {
      const len = this.#dur[i] ?? estimateMs(this.#sentences[i]!, this.#speed);
      if (ms < at + len) return i;
      at += len;
    }
    return last;
  }

  async #pump(epoch: number) {
    if (this.#pumpEpoch === epoch) return;
    this.#pumpEpoch = epoch;
    const signal = this.#abort!.signal;
    try {
      while (epoch === this.#epoch && this.#cursor < this.#sentences.length && this.#cursor - Math.max(this.#playing, 0) <= AHEAD) {
        const i = this.#cursor;
        const audio = await this.#d.synth(this.#sentences[i]!, this.#voice, this.#speed, signal);
        if (epoch !== this.#epoch) return;
        this.#dur[i] = (audio.chunks.reduce((n, c) => n + c.length, 0) / audio.sampleRate) * 1000;
        this.#d.player.chunk(epoch, i, audio);
        this.#cursor++;
      }
    } catch (e) {
      if (epoch !== this.#epoch) return;
      this.#error = e instanceof Error ? e.message : String(e);
      this.#d.player.flush();
      this.#d.emit(this.state);
    } finally {
      if (this.#pumpEpoch === epoch) this.#pumpEpoch = -1;
    }
  }
}
