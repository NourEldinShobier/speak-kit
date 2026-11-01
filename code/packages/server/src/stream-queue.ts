import type { Replace } from "./config";

export const REPLACED = new Error("replaced by a newer request");

export interface Stream {
  ac: AbortController;
  /** Stream group from `X-SpeakKit-Replace: <id>`; undefined for requests that sent no id. */
  group?: string;
  /** Removes this stream from the wait queue, if it is queued. */
  dequeue?: () => void;
}

/** Synthesis slots: at most `maxStreams` run at once, the rest wait FIFO (up to `maxQueue`). Speak streams and exports share them. */
export class StreamQueue {
  /** Running and queued streams. */
  readonly streams = new Set<Stream>();
  #waiters: { go: () => void; reject: (e: unknown) => void }[] = [];
  #running = 0;
  readonly maxStreams: number;
  readonly maxQueue: number;

  constructor(maxStreams: number, maxQueue: number) {
    this.maxStreams = maxStreams;
    this.maxQueue = maxQueue;
  }

  /** No free slot and no room to wait. */
  get full(): boolean {
    return this.#running >= this.maxStreams && this.#waiters.length >= this.maxQueue;
  }

  acquire(s: Stream): Promise<void> {
    if (this.#running < this.maxStreams) {
      this.#running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const w = { go: () => (this.#running++, resolve()), reject };
      this.#waiters.push(w);
      s.dequeue = () => {
        const i = this.#waiters.indexOf(w);
        if (i >= 0) {
          this.#waiters.splice(i, 1);
          reject(s.ac.signal.reason);
        }
      };
    });
  }

  release = (): void => {
    this.#running--;
    this.#waiters.shift()?.go();
  };

  /** A slot for work that has no HTTP stream of its own (exports): waits its turn, gives the slot back through the returned function. */
  async slot(ac: AbortController): Promise<() => void> {
    const s: Stream = { ac };
    ac.signal.addEventListener("abort", () => s.dequeue?.(), { once: true });
    await this.acquire(s);
    return this.release;
  }

  /** "1" replaces every earlier stream of the token; an id only the streams sent with the same id (one per tab). */
  replace(by: Replace): void {
    for (const old of this.streams)
      if ("all" in by || old.group === by.group) {
        old.ac.abort(REPLACED);
        old.dequeue?.();
      }
  }

  abortAll(reason?: unknown): void {
    for (const s of this.streams) s.ac.abort(reason);
  }
}
