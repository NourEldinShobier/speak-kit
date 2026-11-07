import type { EngineList } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { errorText } from "../../error-text";

export const STEPS = ["Welcome", "Voice engine", "Download", "Connect browser", "Done"] as const;
export const MODEL_MB = 177;

export type WizardStep = 0 | 1 | 2 | 3 | 4;
export type WizardChoice = "kokoro" | "chatterbox";

interface WizardState {
  step: WizardStep;
  /** The token was copied (unlocks Continue on the browser step). */
  copied: boolean;
  /** The browser step was skipped. */
  skipped: boolean;
  /** The engine the person wants. Kokoro is installed either way; Chatterbox installs in the background after setup. */
  engine: WizardChoice;
}

export type WizardAction = { type: "go"; step: WizardStep } | { type: "copied" } | { type: "finish-connect"; skipped: boolean } | { type: "choose-engine"; engine: WizardChoice };

export const initWizard = (): WizardState => ({ step: 0, copied: false, skipped: false, engine: "kokoro" });

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "go":
      return { ...state, step: action.step };
    case "copied":
      return { ...state, copied: true };
    case "finish-connect":
      return { ...state, skipped: action.skipped, step: 4 };
    case "choose-engine":
      return { ...state, engine: action.engine };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

interface ChatterboxOffer {
  selectable: boolean;
  /** One sentence under the engine's name: what the choice costs, or the real reason it is not offered. */
  note: string;
}

const INSTALLED = new Set(["unloaded", "loading", "ready"]);

/** Whether the engine step can offer Chatterbox, from the server's engine list (`undefined` while it is still loading). */
export function chatterboxOffer(list: EngineList | null | undefined): ChatterboxOffer {
  if (list === undefined) return { selectable: false, note: "Checking this computer." };
  const e = list?.engines.find((x) => x.id === "chatterbox");
  if (!e) return { selectable: false, note: "This computer cannot run it." };
  if (e.state === "unavailable" && e.reason === "python-missing") return { selectable: false, note: "Installing it needs Python 3.10 to 3.12 or uv, and neither was found." };
  if (e.state === "unavailable" && e.gpu) return { selectable: false, note: `${e.gpu.name} has ${Math.round(e.gpu.vramMb / 1024)} GB. Chatterbox needs 4 GB or more.` };
  if (e.state === "unavailable") return { selectable: false, note: "No NVIDIA graphics card was found. Chatterbox needs one with 4 GB or more." };
  if (INSTALLED.has(e.state)) return { selectable: true, note: "Already installed on this computer." };
  const found = e.gpu ? ` Found ${e.gpu.name}, ${Math.round(e.gpu.vramMb / 1024)} GB.` : "";
  return { selectable: true, note: `Installs in the background after setup. About 2.4 GB.${found}` };
}

export type DownloadPhase = "failed" | "ready" | "downloading";

interface DownloadView {
  phase: DownloadPhase;
  /** 0..1 */
  pct: number;
  detail: string;
}

/** Where the model download stands, from the engine state the server reports. */
export function downloadView(s: AppState): DownloadView {
  const eng = s.health?.engine;
  const failed = eng?.state === "error" || !!s.serverError;
  const ready = eng?.state === "ready" || eng?.state === "unloaded";
  const pct = ready ? 1 : Math.min(1, Math.max(0, eng?.progress ?? 0));
  let phase: DownloadPhase = "downloading";
  if (failed) phase = "failed";
  else if (ready) phase = "ready";
  return { phase, pct, detail: s.serverError ? errorText(s.serverError) : (eng?.detail ?? "") };
}

export const DOWNLOAD_TITLES: Record<DownloadPhase, string> = { failed: "Download paused", ready: "Kokoro-82M is ready", downloading: "Downloading Kokoro-82M" };

const DOWNLOAD_SUBS: Record<DownloadPhase, (pct: number) => string> = {
  failed: (pct) => `The download stopped at ${Math.round(pct * 100)}%. Everything downloaded so far is kept.`,
  ready: () => "Everything is on this computer. Speak Kit works fully offline.",
  downloading: () => "One time only. After this, Speak Kit works fully offline.",
};

export const downloadSub = (v: DownloadView): string => DOWNLOAD_SUBS[v.phase](v.pct);

export type ConnectPhase = "idle" | "waiting" | "connected";

/** The connection test: idle until started, waiting until the extension's first call after the start. */
export function connectPhase(testStart: number | null, lastSeenMs: number | null): ConnectPhase {
  if (testStart === null) return "idle";
  return (lastSeenMs ?? 0) >= testStart ? "connected" : "waiting";
}
