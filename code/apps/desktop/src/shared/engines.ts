import type { EngineInfo, EngineList, Health } from "@speakkit/protocol";
import type { PillTone } from "./engine-view";

export type EngineAction = "download" | "install" | "cancel" | "load" | "retry" | "use" | "fallback" | "remove";

interface EngineRow {
  pill: { label: string; tone: PillTone; spinner: boolean };
  /** One line under the name: what is going on or why it cannot run here. */
  note: string | null;
  /** 0..1 while a bar should show. */
  progress: number | null;
  /** The engine's own words (CUDA or installer text), shown behind a Details control; the note above it is ours. */
  details?: string | undefined;
  actions: EngineAction[];
}

const REASON: Record<NonNullable<EngineInfo["reason"]>, string> = {
  "no-gpu": "Needs a graphics card with enough memory; none was found.",
  "python-missing": "Needs Python 3.10 to 3.12 or uv, and neither was found.",
  "not-installed": "Not installed yet.",
  "out-of-memory": "The graphics card ran out of memory.",
  "disk-full": "There is not enough free disk space.",
};

type Pill = EngineRow["pill"];
const pill = (label: string, tone: PillTone, spinner = false): Pill => ({ label, tone, spinner });

/** What one state contributes: the row without the "use" button, which depends on the active engine, and the buttons before and after it. */
interface StateRow {
  pill: Pill;
  note: string | null;
  progress?: number | null;
  details?: string | undefined;
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
  installing: (e, pct) => ({ pill: pill(`Installing ${pct}%`, "blue", true), note: e.detail ?? "Setting up the engine.", progress: e.progress ?? 0, after: ["cancel"] }),
  missing: (e) => ({ pill: pill("Not installed", "orange"), note: reasonOr(e, null), after: [e.optional ? "install" : "download"] }),
  unavailable: (e) => ({ pill: pill("Unavailable", "orange"), note: reasonOr(e, e.detail ?? "It cannot run on this computer.") }),
  error: (e) => ({ pill: pill("Error", "red"), note: e.detail ?? "The engine stopped.", after: ["retry", ...removable(e)] }),
};

const OUT_OF_MEMORY = "Chatterbox needs about 4 GB of free GPU memory and the graphics card ran out. Close programs that use it, then try again, or use Kokoro.";

/** Rows that the state alone does not decide: what went wrong (G10) and what is going on (G9) for an optional engine. */
function situation(e: EngineInfo, active: boolean): StateRow | null {
  if (e.reason === "out-of-memory" && (e.state === "unloaded" || e.state === "error")) {
    return { pill: pill("Out of GPU memory", "red"), note: OUT_OF_MEMORY, details: e.detail, before: active ? ["fallback", "retry"] : ["retry"], after: removable(e) };
  }
  if (e.state === "missing" && e.reason === "disk-full") return { pill: pill("Not enough disk space", "orange"), note: e.detail ?? REASON["disk-full"], after: ["install"] };
  if (e.state === "missing" && e.detail) {
    return { pill: pill("Install failed", "red"), note: "The install did not finish and left nothing behind. Check your connection and try again.", details: e.detail, after: ["install"] };
  }
  if (e.state === "loading" && e.optional) {
    return { pill: pill("Warming up", "blue", true), note: "Loading the model onto the GPU. This takes about 40 seconds the first time after each launch." };
  }
  return null;
}

/** What the Engines page shows for one engine: pill, note, bar and the buttons that make sense in this state (O2, O3, G8 to G16). */
export function describeEngine(e: EngineInfo, active: boolean): EngineRow {
  const r = situation(e, active) ?? STATE_ROWS[e.state](e, Math.round((e.progress ?? 0) * 100));
  const usable = (e.state === "ready" || e.state === "unloaded") && e.reason !== "out-of-memory";
  const use: EngineAction[] = usable && !active ? ["use"] : [];
  return { pill: r.pill, note: r.note, progress: r.progress ?? null, details: r.details, actions: [...(r.before ?? []), ...use, ...(r.after ?? [])] };
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
        name: id === "kokoro" ? "Kokoro-82M" : "Chatterbox",
        state,
        ...(progress !== undefined ? { progress } : {}),
        ...(detail !== undefined ? { detail } : {}),
        optional: id !== "kokoro",
        cloning: id === "chatterbox",
      },
    ],
  };
}
