import { Worker } from "node:worker_threads";
import type { ImportFailure } from "../../../shared/library/contract";
import { ImportError } from "./import-error";
import type { ParseFn, ParseResult } from "./job";

const TIMEOUT_MS = 60_000;

/** Runs one parse job (worker.js) in a worker thread, so a large PDF or a hostile page cannot block the UI. The thread is ended when it answers or after TIMEOUT_MS. */
export const parseInWorker =
  (workerFile: URL, timeoutMs = TIMEOUT_MS): ParseFn =>
  (job) =>
    new Promise<ParseResult>((resolve, reject) => {
      const copy = job.type === "file" ? job.bytes.slice() : undefined; // the caller keeps its bytes
      const worker = new Worker(workerFile, { workerData: copy ? { ...job, bytes: copy } : job, transferList: copy ? [copy.buffer as ArrayBuffer] : [] });
      const finish = (fn: () => void) => {
        clearTimeout(timer);
        void worker.terminate();
        fn();
      };
      const timer = setTimeout(() => finish(() => reject(new ImportError("unreadable", "Reading this took too long, so it was stopped."))), timeoutMs);
      worker.once("message", (m: { result?: ParseResult; failure?: { reason: ImportFailure; message: string } }) =>
        finish(() => (m.result ? resolve(m.result) : reject(new ImportError(m.failure?.reason ?? "unreadable", m.failure?.message ?? "This could not be read.")))),
      );
      worker.once("error", (e: Error) => finish(() => reject(new ImportError("unreadable", e.message))));
      worker.once("exit", (code) => finish(() => reject(new ImportError("unreadable", `The reader stopped unexpectedly (${code}).`))));
    });
