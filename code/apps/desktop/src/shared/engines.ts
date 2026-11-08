import type { EngineInfo, EngineList, Health } from "@speakkit/protocol";
import type { PillTone } from "./engine-view";

export type EngineAction = "download" | "load" | "retry";

interface EngineRow {
  pill: { label: string; tone: PillTone; spinner: boolean };
  /** One line under the name: what is going on. */
  note: string | null;
  /** 0..1 while a bar should show. */
  progress: number | null;
  actions: EngineAction[];
}

type Pill = EngineRow["pill"];
const pill = (label: string, tone: PillTone, spinner = false): Pill => ({ label, tone, spinner });

/** What one state contributes: the pill, the note, the bar and the buttons. */
interface StateRow {
  pill: Pill;
  note: string | null;
  progress?: number | null;
  actions?: EngineAction[];
}

/** One entry per engine state, so a new state cannot be added without saying what the page shows for it. */
const STATE_ROWS: Record<EngineInfo["state"], (e: EngineInfo, pct: number) => StateRow> = {
  ready: (e) => ({ pill: pill("Ready", "green"), note: e.detail ?? null }),
  unloaded: () => ({ pill: pill("Unloaded", "neutral"), note: "Not in memory (0 MB). It loads when you press play.", actions: ["load"] }),
  loading: () => ({ pill: pill("Loading", "blue", true), note: "Loading into memory." }),
  downloading: (e, pct) => ({ pill: pill(`Download ${pct}%`, "blue", true), note: e.detail ?? "Downloading the model files.", progress: e.progress ?? 0 }),
  missing: () => ({ pill: pill("Not installed", "orange"), note: null, actions: ["download"] }),
  error: (e) => ({ pill: pill("Error", "red"), note: e.detail ?? "The engine stopped.", actions: ["retry"] }),
};

/** What the Engines page shows for the engine: pill, note, bar and the buttons that make sense in its state. */
export function describeEngine(e: EngineInfo): EngineRow {
  const r = STATE_ROWS[e.state](e, Math.round((e.progress ?? 0) * 100));
  return { pill: r.pill, note: r.note, progress: r.progress ?? null, actions: r.actions ?? [] };
}

/** The engine list from health alone, for a server that predates GET /v1/engines. */
export function listFromHealth(h: Health | null): EngineList | null {
  if (!h) return null;
  const { id, state, progress, detail } = h.engine;
  return {
    active: id,
    engines: [
      {
        id,
        name: "Kokoro-82M",
        state,
        ...(progress !== undefined ? { progress } : {}),
        ...(detail !== undefined ? { detail } : {}),
      },
    ],
  };
}
