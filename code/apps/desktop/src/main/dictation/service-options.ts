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
  /** Tests only. */
  os?: DictationOs;
  stt?: Stt;
  rewriter?: Rewriter;
  trash?(file: string): Promise<boolean>;
  /** Tests only: the file pickers, in place of the system dialogs. */
  files?: FilePickers;
}
