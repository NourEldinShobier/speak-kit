/**
 * Everything Speak Kit stores sits under one folder per OS (Electron `userData`: `%APPDATA%\@speakkit\desktop`,
 * `~/Library/Application Support/@speakkit/desktop`, `~/.config/@speakkit/desktop`). These entries are downloaded or generated and can be
 * fetched again, so the uninstaller and Settings > Storage remove them. `build/installer.nsh` repeats the names; a test keeps both in step.
 */
export const DOWNLOAD_ENTRIES = {
  /** Kokoro voice model (Hugging Face cache layout). */
  models: "models",
  /** Optional engines: the Chatterbox virtualenv and weights. */
  engines: "engines",
  /** Chatterbox folder of installs made before `engines/`; a virtualenv cannot be moved, so it stays where it is. */
  legacyChatterbox: "chatterbox",
  /** Finished and partial audio exports. */
  exports: "exports",
  /** Chromium's IndexedDB, where tesseract.js keeps the OCR language data. */
  ocr: "IndexedDB",
} as const;

/** Never removed: the person's own data. */
export const KEPT_ENTRIES = ["library", "voices", "config.json", "token", "engine.json", "logs"] as const;

export type DownloadKind = keyof typeof DOWNLOAD_ENTRIES;

/** What the delete routine reports per entry. */
export interface DownloadsReport {
  removed: { kind: DownloadKind; bytes: number }[];
  /** Entries that could not be removed (in use, no permission) or that sit outside the data folder. */
  failed: { kind: DownloadKind; reason: "outside" | "busy" }[];
  freedBytes: number;
}
