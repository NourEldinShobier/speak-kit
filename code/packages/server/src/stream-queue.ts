import type { Replace } from "./config";

export const REPLACED = new Error("replaced by a newer request");

/** Interactive reads (speak streams) may use every slot; background work (exports) leaves one slot free for them. */
export type Lane = "interactive" | "background";

export interface Stream {
  ac: AbortController;
  /** Stream group from `X-SpeakKit-Replace: <id>`; undefined for requests that sent no id. */
  group?: string;
  /** Removes this stream from the wait queue, if it is queued. */
  dequeue?: () => void;
}

interface Waiter {
  lane: Lane;
  go: () => void;
  reject: (e: unknown) => void;
}

/**
 * Synthesis slots: at most `maxStreams` run at once, the rest wait FIFO (up to `maxQueue`). Speak streams and exports share them,
 * but exports never take the last slot (when there are two or more), so a long export cannot delay reading.
 */
export class StreamQueue {
  /** Running and queued streams. */
  readonly streams = new Set<Stream>();
  #waiters: Waiter[] = [];
  #running: Record<Lane, number> = { interactive: 0, background: 0 };
  readonly maxStreams: number;
  readonly maxQueue: number;
  /** Slots background work may hold at once. */
  readonly maxBackground: number;

  constructor(maxStreams: number, maxQueue: number) {
    this.maxStreams = maxStreams;
    this.maxQueue = maxQueue;
    this.maxBackground = Math.max(1, maxStreams - 1);
  }

  get #total(): number {
    return this.#running.interactive + this.#running.background;
  }

  #canRun(lane: Lane): boolean {
    return this.#total < this.maxStreams && (lane === "interactive" || this.#running.background < this.maxBackground);
  }

  /** No free slot and no room to wait. */
  get full(): boolean {
    return this.#total >= this.maxStreams && this.#waiters.length >= this.maxQueue;
  }

  /** Waits for a slot; resolves to the function that gives it back (safe to call more than once). */
  acquire(s: Stream, lane: Lane = "interactive"): Promise<() => void> {
    const release = once(() => {
      this.#running[lane]--;
      this.#drain();
    });
    if (this.#canRun(lane)) {
      this.#running[lane]++;
      return Promise.resolve(release);
    }
    return new Promise((resolve, reject) => {
      const w: Waiter = { lane, go: () => (this.#running[lane]++, resolve(release)), reject };
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

  /** Starts waiters that fit: interactive ones first, then background ones, each in arrival order. */
  #drain(): void {
    for (const lane of ["interactive", "background"] as const)
      for (let i = 0; i < this.#waiters.length;) {
        const w = this.#waiters[i]!;
        if (w.lane === lane && this.#canRun(lane)) {
          this.#waiters.splice(i, 1);
          w.go();
        } else i++;
      }
  }

  /** A slot for work that has no HTTP stream of its own (exports): waits its turn in the background lane, gives the slot back through the returned function. */
  async slot(ac: AbortController): Promise<() => void> {
    const s: Stream = { ac };
    const onAbort = () => s.dequeue?.();
    ac.signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await this.acquire(s, "background");
    } finally {
      ac.signal.removeEventListener("abort", onAbort);
    }
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

function once(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    fn();
  };
}
