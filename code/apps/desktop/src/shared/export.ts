import type { ExportPrefs } from "./schemas";
import { estimateMs } from "./reader";

export type ExportConflict = "replace" | "keep-both";

/** What the export dialog (J1) sends to start a job. */
export interface ExportOptions {
  text: string;
  voice: string;
  speed: number;
  format: ExportPrefs["format"];
  mp3Kbps: ExportPrefs["mp3Kbps"];
  /** Folder and file name without extension. */
  dir: string;
  name: string;
  /** Only set after the user answered "File exists" (J5). */
  conflict?: ExportConflict;
}

export type ExportStage = "rendering" | "encoding" | "saving" | "done" | "cancelled" | "error";

/** One export as the sidebar pill, the dialog and the tray show it. */
export interface ExportView {
  id: string;
  name: string;
  stage: ExportStage;
  /** 0..1 overall. */
  progress: number;
  /** Sentences rendered / total, while rendering. */
  done: number;
  total: number;
  /** Final file, set when it is saved. */
  path?: string;
  bytes?: number;
  durationMs?: number;
  error?: string;
}

export const exportRunning = (e: ExportView) => e.stage === "rendering" || e.stage === "encoding" || e.stage === "saving";

/** Result of checking the chosen file name against the folder. */
export interface ExportTarget {
  path: string;
  exists: boolean;
  /** Free name next to it, used for "Keep both". */
  alternative: string;
}

/** Characters Windows rejects in a file name, and control characters. */
const isIllegal = (c: string) => '\\/:*?"<>|'.includes(c) || c < " ";
/** A file name Windows accepts, without extension. */
export function safeFileName(raw: string): string {
  const n = [...raw].map((c) => (isIllegal(c) ? " " : c)).join("").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 80).trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n) ? `${n} reading` : n || "SpeakKit reading";
}

/** File size before rendering, from the text: 16-bit mono WAV at 24 kHz or the MP3 bitrate. */
export function estimateBytes(text: string, speed: number, format: ExportPrefs["format"], kbps: number): number {
  const sec = estimateMs(text, speed) / 1000;
  return Math.round(format === "wav" ? sec * 24000 * 2 + 44 : (sec * kbps * 1000) / 8);
}
