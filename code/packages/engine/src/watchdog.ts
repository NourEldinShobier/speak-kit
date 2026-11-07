/**
 * A resettable inactivity timer: `onExpire` runs when `ms` pass without `beat()` while armed.
 * Does not keep the process alive. Used for installer and sidecar heartbeat deadlines.
 */
export class Watchdog {
  #ms: number;
  #onExpire: () => void;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(ms: number, onExpire: () => void) {
    this.#ms = ms;
    this.#onExpire = onExpire;
  }

  /** Starts the timer, or restarts it when already running. */
  arm(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#onExpire();
    }, this.#ms);
    this.#timer.unref();
  }

  /** Signs of life: restarts the timer, but only while it is running. */
  beat(): void {
    if (this.#timer) this.arm();
  }

  stop(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }
}
