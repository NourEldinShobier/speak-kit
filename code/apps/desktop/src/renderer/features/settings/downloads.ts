import type { DownloadKind, DownloadsReport } from "../../../shared/app-data";
import type { StorageInfo } from "../../../shared/ipc";
import { formatBytes } from "../../ui";
import { at } from "../../../shared/i18n";
import "../../../shared/i18n/packs/settings";

/** The rows of the delete confirmation: what goes, with its size. */
export function downloadRows(st: Pick<StorageInfo, "modelsBytes" | "cacheBytes">): [string, string][] {
  return [
    [at("s.store.voice"), formatBytes(st.modelsBytes)],
    [at("s.store.ocrRow"), formatBytes(st.cacheBytes)],
  ];
}

const NAMES = { models: "s.store.nameModels", exports: "s.store.nameExports", ocr: "s.store.nameOcr" } as const satisfies Record<DownloadKind, string>;

/** One sentence for the result: what was freed, or which folders stayed because a file was in use. */
export function resultText(r: DownloadsReport): string {
  if (!r.failed.length) return at("s.store.freed", { size: formatBytes(r.freedBytes) });
  const names = [...new Set(r.failed.map((f) => at(NAMES[f.kind])))].join(", ");
  return at("s.store.freedFailed", { size: formatBytes(r.freedBytes), names });
}
