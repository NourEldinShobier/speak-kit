/** Who holds the microphone right now. Features that open it (screen look, voice chat) claim it for the time they use it; dictation waits for them. */
export function createMicOwners() {
  const held = new Map<symbol, string>();
  return {
    /** Returns the release function; releasing twice is harmless. */
    claim(name: string): () => void {
      const key = Symbol(name);
      held.set(key, name);
      return () => void held.delete(key);
    },
    owner: (): string | undefined => [...held.values()][0],
  };
}
export type MicOwners = ReturnType<typeof createMicOwners>;
