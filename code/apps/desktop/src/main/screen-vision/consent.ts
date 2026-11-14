export type Scope = "window" | "screen";

interface Given {
  window?: number;
  screen?: number;
}

/**
 * Which conversations the user allowed to look at the screen, and how much of it. Memory only: nothing about it is saved, and an entry expires with a
 * conversation's time cap. A look at the window needs a window or a screen consent; a look at the whole screen needs a screen consent of its own,
 * because the scope comes from the model, and a model reading a hostile page must not widen what the user agreed to.
 */
export class Consent {
  readonly #given = new Map<string, Given>();
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #max: number;

  constructor(ttlMs = 30 * 60_000, now: () => number = Date.now, max = 32) {
    this.#ttlMs = ttlMs;
    this.#now = now;
    this.#max = max;
  }

  has(session: string, scope: Scope): boolean {
    const g = this.#given.get(session);
    if (!g) return false;
    const fresh = (at: number | undefined) => at !== undefined && this.#now() - at < this.#ttlMs;
    if (fresh(g.screen) || (scope === "window" && fresh(g.window))) return true;
    if (!fresh(g.window) && !fresh(g.screen)) this.#given.delete(session);
    return false;
  }

  grant(session: string, scope: Scope): void {
    const g = this.#given.get(session);
    this.#given.delete(session);
    this.#given.set(session, { ...g, [scope]: this.#now() });
    while (this.#given.size > this.#max) this.#given.delete(this.#given.keys().next().value!);
  }

  /** The user took it back, or the conversation ended. */
  revoke(session?: string): void {
    if (session === undefined) this.#given.clear();
    else this.#given.delete(session);
  }
}
