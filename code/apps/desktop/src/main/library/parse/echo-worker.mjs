import { parentPort, workerData } from "node:worker_threads";

// Stands in for worker.ts in the runner test: answers like the real worker, or hangs, or fails, by file name.
if (workerData.name === "hang.txt") setInterval(() => {}, 1000);
else if (workerData.name === "fail.txt") parentPort.postMessage({ failure: { reason: "empty", message: "nothing here" } });
else if (workerData.name === "crash.txt") throw new Error("boom");
else parentPort.postMessage({ result: { format: "text", parsed: { title: "", blocks: [{ kind: "paragraph", text: String(workerData.bytes.length) }] } } });
