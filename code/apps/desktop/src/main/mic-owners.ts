/** Who holds the microphone right now. Features that open it (voice chat) claim it for the time they use it; dictation waits for them. */
export function createMicOwners() {
  const held = new Map<symbol, string>();
  /** Returns the release function; releasing twice is harmless. */
  const claim = (name: string): (() => void) => {
    const key = Symbol(name);
    held.set(key, name);
    return () => void held.delete(key);
  };
  /**
   * A claim held by another process that reports now and then (the voice page in the browser). It lapses `ttlMs` after the last report, so a closed
   * browser or a crashed page never leaves dictation blocked.
   */
  const lease = (
    name: string,
    ttlMs = 30_000,
    timers: { set(fn: () => void, ms: number): unknown; clear(t: unknown): void } = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t as NodeJS.Timeout) },
  ) => {
    let release: (() => void) | undefined;
    let timer: unknown;
    const drop = () => {
      timers.clear(timer);
      release?.();
      release = undefined;
    };
    return (held: boolean): void => {
      if (!held) return drop();
      release ??= claim(name);
      timers.clear(timer);
      timer = timers.set(drop, ttlMs);
    };
  };
  return {
    claim,
    lease,
    /** What the voice chat needs: the conversation in the browser holds the microphone by lease. */
    voiceChat: () => ({ mic: lease("Voice chat") }),
    owner: (): string | undefined => [...held.values()][0],
  };
}
