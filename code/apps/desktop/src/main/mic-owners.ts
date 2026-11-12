/** Who holds the microphone right now. Features that open it (screen look, voice chat) claim it for the time they use it; dictation waits for them. */
export function createMicOwners() {
  const held = new Map<symbol, string>();
  /** Returns the release function; releasing twice is harmless. */
  const claim = (name: string): (() => void) => {
    const key = Symbol(name);
    held.set(key, name);
    return () => void held.delete(key);
  };
  return {
    claim,
    /** `fn` as a function that holds the microphone for the length of each call. */
    holding:
      <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) =>
      async (...a: A): Promise<R> => {
        const release = claim(name);
        try {
          return await fn(...a);
        } finally {
          release();
        }
      },
    owner: (): string | undefined => [...held.values()][0],
  };
}
