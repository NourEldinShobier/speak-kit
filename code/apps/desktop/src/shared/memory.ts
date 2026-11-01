import type { Config, IdleChoice } from "./schemas";

/** Idle window per choice in ms; 0 means never unload. */
export const IDLE_MS: Record<IdleChoice, number> = { "1": 60_000, "5": 300_000, "15": 900_000, never: 0 };

/**
 * The server's runtime setters (packages/server SpeakKitServer). Optional so a missing one is reported, not fatal.
 * Load at startup is a creation option (serverOptions), not a setter.
 */
export interface Tunable {
  setIdleUnloadMs?(ms: number): void;
  setOnBattery?(on: boolean): void;
}

export function serverOptions(c: Pick<Config, "idleUnload" | "loadAtStart">) {
  return { idleUnloadMs: IDLE_MS[c.idleUnload], loadAtStart: c.loadAtStart };
}

/** Pushes Settings > Memory to the running server. Battery saver only matters while on battery. */
export function applyMemory(t: Tunable | null | undefined, c: Pick<Config, "idleUnload" | "batterySaver">, onBattery: boolean): string[] {
  const missing: string[] = [];
  const call = <K extends keyof Tunable>(k: K, ...a: Parameters<NonNullable<Tunable[K]>>) => {
    const f = t?.[k] as ((...x: unknown[]) => void) | undefined;
    if (f) f.apply(t, a);
    else missing.push(k);
  };
  call("setIdleUnloadMs", IDLE_MS[c.idleUnload]);
  call("setOnBattery", c.batterySaver && onBattery);
  return missing;
}
