export type TransferState = "running" | "paused";

export interface TransferInfo {
  id: string;
  state: TransferState;
  /** 0..1 */
  fraction: number;
  /** Seconds left from the speed so far; undefined until there is a measurement. */
  etaSeconds?: number;
}

export interface TransferRun {
  signal: AbortSignal;
  progress(fraction: number): void;
}

interface Entry {
  info: TransferInfo;
  ac: AbortController;
  promise: Promise<void>;
  /** The reason the current run was stopped: "pause" keeps the entry for resume(); "cancel" drops it. */
  stop?: "pause" | "cancel";
  run(r: TransferRun): Promise<void>;
  settle: { resolve(): void; reject(e: unknown): void };
}

const PAUSE = Symbol("pause");

/**
 * One transfer per model. Asking for a model that is already downloading joins that transfer instead of starting another, a pause keeps
 * the partial file and the caller waiting, and resume continues the same promise. Cancel rejects it with the abort reason.
 */
export class Transfers {
  readonly #entries = new Map<string, Entry>();
  readonly #listeners = new Set<(list: TransferInfo[]) => void>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  list(): TransferInfo[] {
    return [...this.#entries.values()].map((e) => ({ ...e.info }));
  }
  get(id: string): TransferInfo | undefined {
    const e = this.#entries.get(id);
    return e && { ...e.info };
  }
  onChange(cb: (list: TransferInfo[]) => void): () => void {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }

  /** Starts `run`, or joins the transfer of the same id that is already there. */
  start(id: string, run: (r: TransferRun) => Promise<void>): Promise<void> {
    const existing = this.#entries.get(id);
    if (existing) return existing.promise;
    const e = { info: { id, state: "running", fraction: 0 }, ac: new AbortController(), run } as Entry;
    e.promise = new Promise<void>((resolve, reject) => (e.settle = { resolve, reject }));
    e.promise.catch(() => {
      // a caller that joined late still gets the rejection; this handler only keeps it from being reported as unhandled
    });
    this.#entries.set(id, e);
    this.#go(e);
    this.#emit();
    return e.promise;
  }

  pause(id: string): void {
    const e = this.#entries.get(id);
    if (!e || e.info.state !== "running") return;
    e.stop = "pause";
    e.ac.abort(PAUSE);
  }

  resume(id: string): void {
    const e = this.#entries.get(id);
    if (!e || e.info.state !== "paused") return;
    e.info.state = "running";
    e.ac = new AbortController();
    delete e.stop;
    this.#go(e);
    this.#emit();
  }

  cancel(id: string): void {
    const e = this.#entries.get(id);
    if (!e) return;
    e.stop = "cancel";
    if (e.info.state === "paused") return this.#finish(e, new Error("download cancelled"));
    e.ac.abort(new Error("download cancelled"));
  }

  #go(e: Entry): void {
    const base = e.info.fraction;
    const t0 = this.#now();
    const progress = (fraction: number) => {
      e.info.fraction = fraction;
      const spent = (this.#now() - t0) / 1000;
      const gained = fraction - base;
      if (gained > 0.01 && spent > 1) e.info.etaSeconds = Math.round((spent / gained) * (1 - fraction));
      this.#emit();
    };
    e.run({ signal: e.ac.signal, progress }).then(
      () => this.#finish(e),
      (err) => {
        if (e.stop === "pause" && e.ac.signal.reason === PAUSE) {
          e.info.state = "paused";
          delete e.info.etaSeconds;
          return this.#emit();
        }
        this.#finish(e, err);
      },
    );
  }

  #finish(e: Entry, err?: unknown): void {
    this.#entries.delete(e.info.id);
    if (err === undefined) e.settle.resolve();
    else e.settle.reject(err);
    this.#emit();
  }

  #emit(): void {
    const list = this.list();
    for (const cb of this.#listeners) cb(list);
  }
}
