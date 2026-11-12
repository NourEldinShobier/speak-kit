export class QueueFullError extends Error {
  constructor(limit: number) {
    super(`${limit} jobs are already waiting.`);
  }
}

interface Item {
  id: string;
  run(signal: AbortSignal): Promise<void>;
  ctl: AbortController;
}

/**
 * Background jobs for the one resident engine: one runs at a time, up to `limit` wait. A job that is not running yet is dropped by `cancel`; a running one is aborted
 * with the given reason and ends by itself.
 */
export class JobQueue {
  readonly #limit: number;
  #waiting: Item[] = [];
  #current: Item | undefined;

  constructor(limit = 20) {
    this.#limit = limit;
  }

  get running(): string | undefined {
    return this.#current?.id;
  }

  get waiting(): string[] {
    return this.#waiting.map((i) => i.id);
  }

  has(id: string): boolean {
    return this.#current?.id === id || this.#waiting.some((i) => i.id === id);
  }

  /** Where the job stands: 0 is running now. Throws `QueueFullError` when the waiting line is full, and ignores an id already in the queue. */
  add(id: string, run: (signal: AbortSignal) => Promise<void>): number {
    if (this.has(id)) return this.#current?.id === id ? 0 : this.#waiting.findIndex((i) => i.id === id) + 1;
    if (this.#current && this.#waiting.length >= this.#limit) throw new QueueFullError(this.#limit);
    this.#waiting.push({ id, run, ctl: new AbortController() });
    this.#next();
    return this.#current?.id === id ? 0 : this.#waiting.length;
  }

  /** True when a job was dropped or aborted. A job dropped before it ran gets no call to its `run`: the caller records the cancel. */
  cancel(id: string, reason: "cancel" | "quit" = "cancel"): boolean {
    if (this.#current?.id === id) {
      this.#current.ctl.abort(reason);
      return true;
    }
    const i = this.#waiting.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.#waiting.splice(i, 1);
    return true;
  }

  /** Aborts the running job and drops the waiting ones; returns the ids that were waiting. */
  stopAll(reason: "cancel" | "quit"): string[] {
    const dropped = this.#waiting.map((i) => i.id);
    this.#waiting = [];
    this.#current?.ctl.abort(reason);
    return dropped;
  }

  #next(): void {
    if (this.#current) return;
    const item = this.#waiting.shift();
    if (!item) return;
    this.#current = item;
    void item
      .run(item.ctl.signal)
      .catch(() => {})
      .finally(() => {
        this.#current = undefined;
        this.#next();
      });
  }
}

export interface GateOptions {
  /** True while dictation is recording or transcribing. */
  busy(): boolean;
  sleep(ms: number): Promise<void>;
  pollMs?: number;
}

/** Makes background work wait for dictation: `clear` resolves as soon as `busy` is false (or the signal aborts). */
export function createGate({ busy, sleep, pollMs = 200 }: GateOptions): (signal: AbortSignal) => Promise<void> {
  return async (signal) => {
    while (busy() && !signal.aborted) await sleep(pollMs);
  };
}

/** The other half of the gate: `preempt` resolves as soon as dictation is busy (or the signal aborts), so a chunk already running can give way. */
export function createPreempt({ busy, sleep, pollMs = 200 }: GateOptions): (signal: AbortSignal) => Promise<void> {
  return async (signal) => {
    while (!busy() && !signal.aborted) await sleep(pollMs);
  };
}

/** Both halves for one `busy`: `clear` before a chunk, `preempt` during it. */
export function createGates(o: GateOptions): { clear: (signal: AbortSignal) => Promise<void>; preempt: (signal: AbortSignal) => Promise<void> } {
  return { clear: createGate(o), preempt: createPreempt(o) };
}
