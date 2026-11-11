/** The part of Electron's powerMonitor that is needed here. */
export interface PowerEvents {
  on(event: "lock-screen" | "unlock-screen" | "resume", fn: () => void): unknown;
  off(event: "lock-screen" | "unlock-screen" | "resume", fn: () => void): unknown;
}

const EVENTS = ["lock-screen", "unlock-screen", "resume"] as const;

/** Calls `resync` when the screen locks or unlocks or the computer wakes: key releases may have gone to another desktop. Returns the stop function. */
export function resyncOnPower(power: PowerEvents, resync: () => void): () => void {
  for (const e of EVENTS) power.on(e, resync);
  return () => {
    for (const e of EVENTS) power.off(e, resync);
  };
}
