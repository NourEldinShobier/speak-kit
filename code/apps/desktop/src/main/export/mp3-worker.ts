import { parentPort, workerData } from "node:worker_threads";
import { encodeMp3 } from "./mp3";
import type { Wav } from "./wav";

/** Worker thread entry: encodes one WAV and posts progress, then the MP3 bytes. The main thread stays free for the UI. */
const { wav, kbps } = workerData as { wav: Wav; kbps: number };
encodeMp3(wav, kbps, (p) => parentPort!.postMessage({ progress: p }))
  .then((mp3) => parentPort!.postMessage({ mp3 }, [mp3.buffer as ArrayBuffer]))
  .catch((e) => parentPort!.postMessage({ error: e instanceof Error ? e.message : String(e) }));
