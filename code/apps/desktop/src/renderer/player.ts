import type { PreviewAudio } from "../shared/ipc";

export interface PlayerEvents {
  started(epoch: number, index: number): void;
  done(epoch: number, index: number): void;
}

/** The slice of the Web Audio API the player uses (a fake stands in for tests). */
export interface AudioLike {
  currentTime: number;
  destination: unknown;
  createBuffer(channels: number, length: number, rate: number): { duration: number; getChannelData(c: number): Float32Array };
  createBufferSource(): {
    buffer: unknown;
    onended: (() => void) | null;
    connect(d: unknown): void;
    start(at: number): void;
    stop(): void;
  };
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

interface Queued {
  index: number;
  src: ReturnType<AudioLike["createBufferSource"]>;
}

/** Gapless playback of sentences on one AudioContext. Reports each sentence start and end; pause suspends the context. */
export class ChunkPlayer {
  #ctx: AudioLike | undefined;
  #make: (rate: number) => AudioLike;
  #ev: PlayerEvents;
  #queue: Queued[] = [];
  #endAt = 0;
  #paused = false;

  constructor(make: (rate: number) => AudioLike, events: PlayerEvents) {
    this.#make = make;
    this.#ev = events;
  }

  chunk(epoch: number, index: number, audio: PreviewAudio): void {
    const ctx = (this.#ctx ??= this.#make(audio.sampleRate));
    const samples = audio.chunks.reduce((n, c) => n + c.length, 0);
    const buf = ctx.createBuffer(1, Math.max(1, samples), audio.sampleRate);
    const data = buf.getChannelData(0);
    let o = 0;
    for (const pcm of audio.chunks) for (let i = 0; i < pcm.length; i++) data[o++] = pcm[i]! / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.03, this.#endAt);
    src.start(at);
    this.#endAt = at + buf.duration;
    const item: Queued = { index, src };
    const first = this.#queue.length === 0;
    this.#queue.push(item);
    src.onended = () => {
      this.#queue = this.#queue.filter((q) => q !== item);
      this.#ev.done(epoch, index);
      const next = this.#queue[0];
      if (next) this.#ev.started(epoch, next.index);
    };
    if (first) this.#ev.started(epoch, index);
  }

  pause(): void {
    this.#paused = true;
    void this.#ctx?.suspend();
  }

  resume(): void {
    this.#paused = false;
    void this.#ctx?.resume();
  }

  /** Drops everything queued and playing. Keeps the paused flag so a seek while paused stays paused. */
  flush(): void {
    for (const { src } of this.#queue.splice(0)) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* not started yet */
      }
    }
    this.#endAt = 0;
  }

  get paused() {
    return this.#paused;
  }
}
