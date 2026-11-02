import type { EngineInfo, EngineList, Health } from "@speakkit/protocol";
import type { PillTone } from "./engine-view";

export type EngineAction = "download" | "install" | "load" | "retry" | "use" | "remove";

interface EngineRow {
  pill: { label: string; tone: PillTone; spinner: boolean };
  /** One line under the name: what is going on or why it cannot run here. */
  note: string | null;
  /** 0..1 while a bar should show. */
  progress: number | null;
  actions: EngineAction[];
}

const REASON: Record<NonNullable<EngineInfo["reason"]>, string> = {
  "no-gpu": "Needs a graphics card with enough memory; none was found.",
  "python-missing": "Needs Python 3.10 or newer, which was not found.",
  "not-installed": "Not installed yet.",
};

type Pill = EngineRow["pill"];
const pill = (label: string, tone: PillTone, spinner = false): Pill => ({ label, tone, spinner });

/** What one state contributes: the row without the "use" button, which depends on the active engine, and the buttons before and after it. */
interface StateRow {
  pill: Pill;
  note: string | null;
  progress?: number | null;
  before?: EngineAction[];
  after?: EngineAction[];
}

const removable = (e: EngineInfo): EngineAction[] => (e.optional ? ["remove"] : []);
const reasonOr = (e: EngineInfo, fallback: string | null) => (e.reason ? REASON[e.reason] : fallback);

/** One entry per engine state, so a new state cannot be added without saying what the page shows for it. */
const STATE_ROWS: Record<EngineInfo["state"], (e: EngineInfo, pct: number) => StateRow> = {
  ready: (e) => ({ pill: pill("Ready", "green"), note: e.detail ?? null, after: removable(e) }),
  unloaded: (e) => ({ pill: pill("Unloaded", "neutral"), note: "Not in memory (0 MB). It loads when you press play.", before: ["load"], after: removable(e) }),
  loading: () => ({ pill: pill("Loading", "blue", true), note: "Loading into memory." }),
  downloading: (e, pct) => ({ pill: pill(`Download ${pct}%`, "blue", true), note: e.detail ?? "Downloading the model files.", progress: e.progress ?? 0 }),
  installing: (e, pct) => ({ pill: pill(`Installing ${pct}%`, "blue", true), note: e.detail ?? "Setting up the engine.", progress: e.progress ?? 0 }),
  missing: (e) => ({ pill: pill("Not installed", "orange"), note: reasonOr(e, null), after: [e.optional ? "install" : "download"] }),
  unavailable: (e) => ({ pill: pill("Unavailable", "orange"), note: reasonOr(e, e.detail ?? "It cannot run on this computer.") }),
  error: (e) => ({ pill: pill("Error", "red"), note: e.detail ?? "The engine stopped.", after: ["retry", ...removable(e)] }),
};

/** What the Engines page shows for one engine: pill, note, bar and the buttons that make sense in this state (O2, O3, G8 to G16). */
export function describeEngine(e: EngineInfo, active: boolean): EngineRow {
  const r = STATE_ROWS[e.state](e, Math.round((e.progress ?? 0) * 100));
  const usable = e.state === "ready" || e.state === "unloaded";
  const use: EngineAction[] = usable && !active ? ["use"] : [];
  return { pill: r.pill, note: r.note, progress: r.progress ?? null, actions: [...(r.before ?? []), ...use, ...(r.after ?? [])] };
}

/** The engine list from health alone, for a server that predates GET /v1/engines. */
export function listFromHealth(h: Health | null): EngineList | null {
  if (!h) return null;
  const { id, state, progress, detail } = h.engine;
  return { active: id, engines: [{ id, name: id === "kokoro" ? "Kokoro-82M" : "Chatterbox", state, progress, detail, optional: id !== "kokoro", cloning: id === "chatterbox" }] };
}
