import type { PlayerDeps } from "./deps";

const HOLD_MS = 600_000;
const HOLD_REFRESH_MS = 300_000;
/** The offscreen document is closed this long after playback stopped (nothing else needs it). */
export const IDLE_CLOSE_MS = 60_000;

/** A repeating timer on the injected `setInterval`/`clearInterval`; starting twice keeps the first, stopping twice is harmless. */
export class RepeatTimer {
  #id: unknown;
  #deps: Pick<PlayerDeps, "setInterval" | "clearInterval">;
  #fire: () => void;
  #ms: number;

  constructor(deps: Pick<PlayerDeps, "setInterval" | "clearInterval">, fire: () => void, ms: number) {
    this.#deps = deps;
    this.#fire = fire;
    this.#ms = ms;
  }

  start(): void {
    if (this.#id !== undefined) return;
    const set = this.#deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.#id = set(this.#fire, this.#ms);
  }

  stop(): void {
    if (this.#id === undefined) return;
    (this.#deps.clearInterval ?? ((id) => clearInterval(id as number)))(this.#id);
    this.#id = undefined;
  }
}

/** Keeps the server's model loaded while playback is paused (POST /v1/engine/hold, refreshed before it lapses), and releases it after. */
export class ModelHold {
  #held = false;
  #hold: PlayerDeps["hold"];
  #refresh: RepeatTimer;

  constructor(deps: Pick<PlayerDeps, "hold" | "setInterval" | "clearInterval">) {
    this.#hold = deps.hold;
    this.#refresh = new RepeatTimer(deps, () => this.#hold?.(HOLD_MS), HOLD_REFRESH_MS);
  }

  start(): void {
    if (!this.#hold) return;
    this.#hold(HOLD_MS);
    this.#held = true;
    this.#refresh.start();
  }

  end(): void {
    this.#refresh.stop();
    if (this.#held) this.#hold?.(0);
    this.#held = false;
  }
}

/** One-shot timer for the idle shutdown; arming again replaces the pending one. */
export class IdleTimer {
  #id: unknown;
  #deps: Pick<PlayerDeps, "setTimeout" | "clearTimeout">;
  #fire: () => void;

  constructor(deps: Pick<PlayerDeps, "setTimeout" | "clearTimeout">, fire: () => void) {
    this.#deps = deps;
    this.#fire = fire;
  }

  arm(): void {
    this.cancel();
    const set = this.#deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.#id = set(() => {
      this.#id = undefined;
      this.#fire();
    }, IDLE_CLOSE_MS);
  }

  cancel(): void {
    if (this.#id === undefined) return;
    (this.#deps.clearTimeout ?? ((id) => clearTimeout(id as number)))(this.#id);
    this.#id = undefined;
  }
}
