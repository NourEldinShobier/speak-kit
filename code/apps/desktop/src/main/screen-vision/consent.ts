/** Which conversations the user allowed to look at the screen. Memory only: nothing about it is saved, and an entry expires with a conversation's time cap. */
export class Consent {
  readonly #given = new Map<string, number>();
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #max: number;

  constructor(ttlMs = 30 * 60_000, now: () => number = Date.now, max = 32) {
    this.#ttlMs = ttlMs;
    this.#now = now;
    this.#max = max;
  }

  has(session: string): boolean {
    const at = this.#given.get(session);
    if (at === undefined) return false;
    if (this.#now() - at < this.#ttlMs) return true;
    this.#given.delete(session);
    return false;
  }

  grant(session: string): void {
    this.#given.delete(session);
    this.#given.set(session, this.#now());
    while (this.#given.size > this.#max) this.#given.delete(this.#given.keys().next().value!);
  }

  /** The user took it back, or the conversation ended. */
  revoke(session?: string): void {
    if (session === undefined) this.#given.clear();
    else this.#given.delete(session);
  }
}
