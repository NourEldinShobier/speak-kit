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

/** What the Engines page shows for one engine: pill, note, bar and the buttons that make sense in this state (O2, O3, G8 to G16). */
export function describeEngine(e: EngineInfo, active: boolean): EngineRow {
  const pct = Math.round((e.progress ?? 0) * 100);
  const usable = e.state === "ready" || e.state === "unloaded";
  const actions: EngineAction[] = [];
  const row = (pill: EngineRow["pill"], note: string | null, progress: number | null = null): EngineRow => ({ pill, note, progress, actions });
  if (usable && !active) actions.push("use");
  switch (e.state) {
    case "ready":
      if (e.optional) actions.push("remove");
      return row({ label: "Ready", tone: "green", spinner: false }, e.detail ?? null);
    case "unloaded":
      actions.unshift("load");
      if (e.optional) actions.push("remove");
      return row({ label: "Unloaded", tone: "neutral", spinner: false }, "Not in memory (0 MB). It loads when you press play.");
    case "loading":
      return row({ label: "Loading", tone: "blue", spinner: true }, "Loading into memory.", null);
    case "downloading":
      return row({ label: `Download ${pct}%`, tone: "blue", spinner: true }, e.detail ?? "Downloading the model files.", e.progress ?? 0);
    case "installing":
      return row({ label: `Installing ${pct}%`, tone: "blue", spinner: true }, e.detail ?? "Setting up the engine.", e.progress ?? 0);
    case "missing":
      actions.push(e.optional ? "install" : "download");
      return row({ label: "Not installed", tone: "orange", spinner: false }, e.reason ? REASON[e.reason] : null);
    case "unavailable":
      return row({ label: "Unavailable", tone: "orange", spinner: false }, e.reason ? REASON[e.reason] : (e.detail ?? "It cannot run on this computer."));
    case "error":
      actions.push("retry");
      if (e.optional) actions.push("remove");
      return row({ label: "Error", tone: "red", spinner: false }, e.detail ?? "The engine stopped.");
  }
}

/** The engine list from health alone, for a server that predates GET /v1/engines. */
export function listFromHealth(h: Health | null): EngineList | null {
  if (!h) return null;
  const { id, state, progress, detail } = h.engine;
  return { active: id, engines: [{ id, name: id === "kokoro" ? "Kokoro-82M" : "Chatterbox", state, progress, detail, optional: id !== "kokoro", cloning: id === "chatterbox" }] };
}
