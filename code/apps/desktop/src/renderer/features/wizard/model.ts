import type { AppState } from "../../../shared/ipc";
import { errorText } from "../../error-text";

export const STEPS = ["Welcome", "Voice engine", "Download", "Connect browser", "Done"] as const;
export const MODEL_MB = 177;

export type WizardStep = 0 | 1 | 2 | 3 | 4;

interface WizardState {
  step: WizardStep;
  /** The token was copied (unlocks Continue on the browser step). */
  copied: boolean;
  /** The browser step was skipped. */
  skipped: boolean;
}

export type WizardAction = { type: "go"; step: WizardStep } | { type: "copied" } | { type: "finish-connect"; skipped: boolean };

export const initWizard = (): WizardState => ({ step: 0, copied: false, skipped: false });

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "go":
      return { ...state, step: action.step };
    case "copied":
      return { ...state, copied: true };
    case "finish-connect":
      return { ...state, skipped: action.skipped, step: 4 };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
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
