import { parentPort, workerData } from "node:worker_threads";
import { toDesktopError } from "../../shared/errors";
import { encodeMp3 } from "./mp3";
import type { Wav } from "@speakkit/engine";

/** Worker thread entry: encodes one WAV and posts progress, then the MP3 bytes. The main thread stays free for the UI. */
const { wav, kbps } = workerData as { wav: Wav; kbps: number };
encodeMp3(wav, kbps, (p) => parentPort!.postMessage({ progress: p }))
  .then((mp3) => parentPort!.postMessage({ mp3 }, [mp3.buffer as ArrayBuffer]))
  .catch((e) => parentPort!.postMessage({ error: toDesktopError(e) }));
