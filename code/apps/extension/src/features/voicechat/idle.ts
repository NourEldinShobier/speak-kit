export const IDLE_MS = 120_000;
export const WARN_S = 30;

/**
 * Two quiet minutes warn "Still there?", thirty more seconds end the conversation. `touch` (speech) restarts the quiet time;
 * `keepGoing` leaves the warning. Uses the global timers, so tests drive it with fake timers.
 */
export class IdleTimer {
  private quiet: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval> | undefined;
  private readonly on: { warn(secondsLeft: number): void; end(): void };
  private readonly idleMs: number;
  private readonly warnS: number;
  constructor(on: { warn(secondsLeft: number): void; end(): void }, idleMs = IDLE_MS, warnS = WARN_S) {
    this.on = on;
    this.idleMs = idleMs;
    this.warnS = warnS;
  }

  /** Starts, or restarts, the quiet time. */
  touch() {
    this.stop();
    this.quiet = setTimeout(() => this.warn(), this.idleMs);
  }
  stop() {
    clearTimeout(this.quiet);
    clearInterval(this.tick);
    this.quiet = this.tick = undefined;
  }

  private warn() {
    let left = this.warnS;
    this.on.warn(left);
    this.tick = setInterval(() => {
      left--;
      if (left > 0) return this.on.warn(left);
      this.stop();
      this.on.end();
    }, 1000);
  }
}
