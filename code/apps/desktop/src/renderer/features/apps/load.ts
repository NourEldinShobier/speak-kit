import type { InstalledApp } from "@speakkit/dictation";

export type Found = { status: "loading" } | { status: "ready"; apps: InstalledApp[] } | { status: "unavailable" };

/** Asks for a fresh scan: a program installed a moment ago must show up when the picker opens. A failed ask means unavailable. */
export async function loadInstalledApps(ask: (refresh: boolean) => Promise<{ apps: InstalledApp[]; available: boolean }>): Promise<Found> {
  try {
    const r = await ask(true);
    return r.available ? { status: "ready", apps: r.apps } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
