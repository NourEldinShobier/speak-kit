export const IDLE_MS = 120_000;
export const WARN_S = 30;
/** A conversation ends 15 minutes after it began, however busy: speech, noise on the microphone and "Keep going" restart only the quiet time. */
export const MAX_SESSION_MS = 15 * 60_000;

/**
 * Two quiet minutes warn "Still there?", thirty more seconds end the conversation. `touch` (speech) restarts the quiet time;
 * `keepGoing` leaves the warning. The hard cap runs from the first `touch` and nothing moves it. Uses the global timers, so tests drive it with fake timers.
 */
export class IdleTimer {
  private quiet: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval> | undefined;
  private cap: ReturnType<typeof setTimeout> | undefined;
  private readonly on: { warn(secondsLeft: number): void; end(): void };
  private readonly idleMs: number;
  private readonly warnS: number;
  private readonly capMs: number;
  constructor(on: { warn(secondsLeft: number): void; end(): void }, limits: { idleMs?: number | undefined; warnS?: number | undefined; capMs?: number | undefined } = {}) {
    this.on = on;
    this.idleMs = limits.idleMs ?? IDLE_MS;
    this.warnS = limits.warnS ?? WARN_S;
    this.capMs = limits.capMs ?? MAX_SESSION_MS;
  }

  /** Starts, or restarts, the quiet time. */
  touch() {
    this.pause();
    this.quiet = setTimeout(() => this.warn(), this.idleMs);
    this.cap ??= setTimeout(() => {
      this.stop();
      this.on.end();
    }, this.capMs);
  }
  /** Cancels everything, the cap too. */
  stop() {
    this.pause();
    clearTimeout(this.cap);
    this.cap = undefined;
  }
  private pause() {
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
