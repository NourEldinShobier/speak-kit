import type { DownloadKind, DownloadsReport } from "../../../shared/app-data";
import type { StorageInfo } from "../../../shared/ipc";
import { formatBytes } from "../../ui";

/** The rows of the delete confirmation: what goes, with its size. */
export function downloadRows(st: Pick<StorageInfo, "modelsBytes" | "enginesBytes" | "cacheBytes">): [string, string][] {
  return [
    ["Voice models", formatBytes(st.modelsBytes)],
    ["Optional engines", formatBytes(st.enginesBytes)],
    ["OCR language data and exports", formatBytes(st.cacheBytes)],
  ];
}

const NAMES: Record<DownloadKind, string> = {
  models: "voice models",
  engines: "optional engines",
  legacyChatterbox: "optional engines",
  exports: "exports",
  ocr: "OCR language data",
};

/** One sentence for the result: what was freed, or which folders stayed because a file was in use. */
export function resultText(r: DownloadsReport): string {
  if (!r.failed.length) return `Freed ${formatBytes(r.freedBytes)}. Speak Kit downloads the voice model again the next time you read.`;
  const names = [...new Set(r.failed.map((f) => NAMES[f.kind]))].join(", ");
  return `Freed ${formatBytes(r.freedBytes)}. Could not remove ${names}: close the apps that use them and try again.`;
}
