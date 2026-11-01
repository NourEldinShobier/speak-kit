import { parentPort, workerData } from "node:worker_threads";
import { ImportError } from "./import-error";
import { runParseJob, type ParseJob } from "./job";

/** Worker thread entry: parses one job and posts the result, or the failure with its reason. The main thread stays free for the UI. */
runParseJob(workerData as ParseJob).then(
  (result) => parentPort!.postMessage({ result }),
  (e) => parentPort!.postMessage({ failure: { reason: e instanceof ImportError ? e.reason : "unreadable", message: e instanceof Error ? e.message : String(e) } }),
);
