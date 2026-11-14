import type { BrowserWindow } from "electron";
import type { Rewriter } from "@speakkit/dictation";
import type { FilePickers } from "./history-api";
import type { DictationOs } from "./index";
import type { Stt } from "./stt";

export interface DictationServiceOptions {
  dataDir: string;
  modelsDir: string;
  /** Directory of the bundled main-process files; the renderer pages sit in ../renderer. */
  distDir: string;
  /** The speech worker file (dist/worker/stt-worker.js when built, the source file in development). */
  sttWorker: URL;
  parent(): BrowserWindow | null;
  /** The test hook is on: a scripted speech engine replaces the real one and the microphone can be refused. */
  test: boolean;
  /** The saved OpenAI key, for the rewrite pass. */
  readKey?(): Promise<string | null>;
  hasKey?(): Promise<boolean>;
  /** The feature that holds the microphone now (screen look, voice chat), or undefined. Dictation waits for it. */
  micOwner?: () => string | undefined;
  /** Host name of the page the browser extension reported lately; modes by website use it when a browser is in front. */
  pageSite?: () => string | undefined;
  /** Tests only. */
  os?: DictationOs;
  stt?: Stt;
  rewriter?: Rewriter;
  trash?(file: string): Promise<boolean>;
  /** Tests only: the file pickers, in place of the system dialogs. */
  files?: FilePickers;
}
