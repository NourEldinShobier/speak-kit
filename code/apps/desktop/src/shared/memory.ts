/** The voice model unloads after this long without a reading. */
export const IDLE_UNLOAD_MS = 300_000;

/**
 * The server's runtime setters (SpeakKitServer). Optional so a missing one is reported, not fatal.
 */
export interface Tunable {
  setIdleUnloadMs?(ms: number): void;
  setOnBattery?(on: boolean): void;
}

export const serverOptions = () => ({ idleUnloadMs: IDLE_UNLOAD_MS });

/** Pushes the memory rules to the running server: the idle window, and whether the computer is on battery (the model then unloads sooner). */
export function applyMemory(t: Tunable | null | undefined, onBattery: boolean): string[] {
  const missing: string[] = [];
  const call = <K extends keyof Tunable>(k: K, ...a: Parameters<NonNullable<Tunable[K]>>) => {
    const f = t?.[k] as ((...x: unknown[]) => void) | undefined;
    if (f) f.apply(t, a);
    else missing.push(k);
  };
  call("setIdleUnloadMs", IDLE_UNLOAD_MS);
  call("setOnBattery", onBattery);
  return missing;
}
