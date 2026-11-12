export const IDLE_CHOICES = [5, 15, 30, 60, 0] as const;
/** Minutes of silence before the speech model is released; 0 is never. */
export type IdleMinutes = (typeof IDLE_CHOICES)[number];
export const DEFAULT_IDLE_MINUTES: IdleMinutes = 15;

export interface IdleDeps {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export interface IdleOptions {
  minutes(): IdleMinutes;
  /** A job is queued or running: never release under it. */
  busy(): boolean;
  /** Releases the model; the returned promise settles when it is gone. */
  release(): Promise<void>;
  deps?: IdleDeps;
}

const real: IdleDeps = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout), now: Date.now };

/**
 * Releases the speech model after a quiet spell. `touch()` restarts the wait; a model that is busy when the wait ends is given the full wait
 * again, and a model that is not loaded needs no timer. With "never" nothing is scheduled.
 */
export class IdleRelease {
  readonly #o: IdleOptions;
  readonly #d: IdleDeps;
  #handle: unknown;
  #dueAt: number | undefined;

  constructor(o: IdleOptions) {
    this.#o = o;
    this.#d = o.deps ?? real;
  }

  /** When the release will happen if nothing happens (epoch ms), or undefined. */
  get dueAt(): number | undefined {
    return this.#dueAt;
  }

  /** The model was just used or loaded. */
  touch(): void {
    this.stop();
    const minutes = this.#o.minutes();
    if (minutes <= 0) return;
    const ms = minutes * 60_000;
    this.#dueAt = this.#d.now() + ms;
    this.#handle = this.#d.setTimeout(() => void this.#fire(), ms);
  }

  stop(): void {
    if (this.#handle !== undefined) this.#d.clearTimeout(this.#handle);
    this.#handle = undefined;
    this.#dueAt = undefined;
  }

  async #fire(): Promise<void> {
    this.#handle = undefined;
    this.#dueAt = undefined;
    if (this.#o.busy()) return this.touch();
    try {
      await this.#o.release();
    } catch {
      // nothing is loaded that could be held back
    }
  }
}
