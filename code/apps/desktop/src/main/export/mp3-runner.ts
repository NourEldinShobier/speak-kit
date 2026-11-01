import { Worker } from "node:worker_threads";
import type { ExportDeps } from "./jobs";

/** Runs the MP3 encoder (mp3-worker.js) in a worker thread; aborting terminates the thread. */
export const mp3InWorker =
  (workerFile: URL): ExportDeps["mp3"] =>
  (wav, kbps, onProgress, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("cancelled", "AbortError"));
      const worker = new Worker(workerFile, { workerData: { wav, kbps } });
      const finish = (fn: () => void) => {
        signal.removeEventListener("abort", onAbort);
        void worker.terminate();
        fn();
      };
      const onAbort = () => finish(() => reject(new DOMException("cancelled", "AbortError")));
      signal.addEventListener("abort", onAbort, { once: true });
      worker.on("message", (m: { progress?: number; mp3?: Uint8Array; error?: string }) => {
        if (m.progress !== undefined) onProgress(m.progress);
        else if (m.mp3) finish(() => resolve(m.mp3!));
        else finish(() => reject(new Error(m.error ?? "MP3 encoding failed.")));
      });
      worker.on("error", (e) => finish(() => reject(e)));
    });
