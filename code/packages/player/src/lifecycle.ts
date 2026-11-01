import type { PlayerDeps } from "./deps";

const HOLD_MS = 600_000;
const HOLD_REFRESH_MS = 300_000;
/** The offscreen document is closed this long after playback stopped (nothing else needs it). */
export const IDLE_CLOSE_MS = 60_000;

/** Keeps the server's model loaded while playback is paused (POST /v1/engine/hold, refreshed before it lapses), and releases it after. */
export class ModelHold {
  #holding: unknown;
  #held = false;
  #deps: Pick<PlayerDeps, "hold" | "setInterval" | "clearInterval">;

  constructor(deps: Pick<PlayerDeps, "hold" | "setInterval" | "clearInterval">) {
    this.#deps = deps;
  }

  start(): void {
    const { hold } = this.#deps;
    if (!hold) return;
    hold(HOLD_MS);
    this.#held = true;
    const set = this.#deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    if (this.#holding === undefined) this.#holding = set(() => hold(HOLD_MS), HOLD_REFRESH_MS);
  }

  end(): void {
    if (this.#holding !== undefined) (this.#deps.clearInterval ?? ((id) => clearInterval(id as number)))(this.#holding);
    this.#holding = undefined;
    if (this.#held) this.#deps.hold?.(0);
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
