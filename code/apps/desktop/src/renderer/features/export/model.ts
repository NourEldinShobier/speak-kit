import "../../../shared/i18n/packs/export";
import { englishT, type TFn } from "../../../shared/i18n";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import type { ExportCaptions, ExportStage, ExportTarget, ExportView } from "../../../shared/export";
import { titleOf } from "../../../shared/reader";
import type { ExportPrefs } from "../../../shared/schemas";

/** What the dialog is opened with. */
export interface ExportOpen {
  text: string;
  /** File name to suggest; the start of the text when missing. */
  name?: string;
  /** Reopening a running or finished job from the sidebar pill. */
  jobId?: string;
}

/** The options the person edits. */
export interface ExportForm {
  text: string;
  name: string;
  format: ExportPrefs["format"];
  kbps: number;
  voice: string;
  dir: string;
  captions: ExportCaptions;
  chapters: boolean;
}

/** Which step of the flow the dialog is on; the job's own stage comes from the app state. */
export type ExportPhase = { kind: "options" } | { kind: "exists"; target: ExportTarget } | { kind: "job"; id: string };

export interface ExportState {
  form: ExportForm;
  voices: Voice[];
  error: string | null;
  phase: ExportPhase;
}

export type ExportAction =
  | { type: "edit"; patch: Partial<ExportForm> }
  | { type: "voices"; voices: Voice[] }
  | { type: "attempt" }
  | { type: "exists"; target: ExportTarget }
  | { type: "rename" }
  | { type: "started"; jobId: string }
  | { type: "failed"; message: string }
  | { type: "back-to-options" };

export function initExport(s: AppState, open: ExportOpen): ExportState {
  const prefs = s.config.exportPrefs;
  return {
    form: {
      text: open.text,
      name: open.name || titleOf(open.text).replace(/…$/, "").slice(0, 40).trim() || "Speak Kit reading",
      format: prefs.format,
      kbps: prefs.mp3Kbps,
      voice: s.config.voice,
      dir: prefs.folder || s.exportDir,
      captions: prefs.captions,
      chapters: prefs.chapters,
    },
    voices: [],
    error: null,
    phase: open.jobId ? { kind: "job", id: open.jobId } : { kind: "options" },
  };
}

export function exportReducer(state: ExportState, action: ExportAction): ExportState {
  switch (action.type) {
    case "edit":
      return { ...state, form: { ...state.form, ...action.patch } };
    case "voices":
      return { ...state, voices: action.voices };
    case "attempt":
      return { ...state, error: null };
    case "exists":
      return { ...state, phase: { kind: "exists", target: action.target } };
    case "rename":
    case "back-to-options":
      return { ...state, phase: { kind: "options" } };
    case "started":
      return { ...state, phase: { kind: "job", id: action.jobId } };
    case "failed":
      return { ...state, error: action.message };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

type ExportViewKind = "options" | "exists" | "rendering" | "done" | "error" | "cancelled";

const KIND_BY_STAGE: Record<ExportStage, ExportViewKind> = { rendering: "rendering", encoding: "rendering", saving: "rendering", done: "done", error: "error", cancelled: "cancelled" };

/** The view to show: the job's stage once it exists, else the step the person is on. */
export function exportViewKind(phase: ExportPhase, job: ExportView | undefined): ExportViewKind {
  if (phase.kind === "job" && job) return KIND_BY_STAGE[job.stage];
  return phase.kind === "exists" ? "exists" : "options";
}

/** The dialog title for a view, in the given language (English by default). */
export const exportTitle = (kind: ExportViewKind, t: TFn = englishT): string => t(`export.title.${kind}`);
