import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DOWNLOAD_ENTRIES, type DownloadKind, type DownloadsReport } from "../shared/app-data";

export async function dirSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // missing or unreadable: nothing to count
  }
  const sizes = await Promise.all(
    entries.map((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory()
        ? dirSize(p)
        : stat(p).then(
            (s) => s.size,
            () => 0,
          );
    }),
  );
  return sizes.reduce((a, b) => a + b, 0);
}

const inside = (root: string, target: string) => {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** Absolute folder per entry. `modelsDir` may be overridden (SPEAKKIT_MODELS_DIR) and then sits outside `root`. */
export function downloadDirs(root: string, modelsDir = path.join(root, DOWNLOAD_ENTRIES.models)): Record<DownloadKind, string> {
  const dirs = {} as Record<DownloadKind, string>;
  for (const kind of Object.keys(DOWNLOAD_ENTRIES) as DownloadKind[]) dirs[kind] = path.join(root, DOWNLOAD_ENTRIES[kind]);
  dirs.models = modelsDir;
  return dirs;
}

/** Sizes in bytes for the Storage page and the confirmation: models, engines (both folders) and caches (exports, OCR data). */
export async function measureDownloads(root: string, modelsDir?: string) {
  const d = downloadDirs(root, modelsDir);
  const [models, engines, legacy, exports, ocr] = await Promise.all([d.models, d.engines, d.legacyChatterbox, d.exports, d.ocr].map(dirSize));
  return { modelsBytes: models!, enginesBytes: engines! + legacy!, cacheBytes: exports! + ocr! };
}

/**
 * Deletes the downloaded and generated folders under `root`, nothing else. A folder outside `root` (a models folder set by an
 * environment variable) is refused. A folder that cannot be removed (a file in use) is reported, not thrown.
 */
export async function removeDownloads(root: string, modelsDir?: string, remove: typeof rm = rm): Promise<DownloadsReport> {
  const report: DownloadsReport = { removed: [], failed: [], freedBytes: 0 };
  const dirs = downloadDirs(root, modelsDir);
  for (const kind of Object.keys(dirs) as DownloadKind[]) {
    const dir = dirs[kind];
    if (!inside(root, dir)) {
      report.failed.push({ kind, reason: "outside" });
      continue;
    }
    const bytes = await dirSize(dir);
    try {
      await remove(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
      if (bytes) report.removed.push({ kind, bytes });
      report.freedBytes += bytes;
    } catch {
      report.failed.push({ kind, reason: "busy" });
    }
  }
  return report;
}
