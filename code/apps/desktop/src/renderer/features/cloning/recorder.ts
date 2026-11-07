import { CLONE_MAX_MS } from "@speakkit/protocol";
import { meterLevel, rms, type Take } from "./audio";
import { decodeTake } from "./decode";
import type { MicProblem } from "./model";

export interface RecorderEvents {
  onTick(elapsedMs: number, level: number): void;
  onDone(take: Take): void;
  onFailed(problem: MicProblem | null, message: string): void;
}

export interface Recording {
  /** Ends the recording and delivers the take. */
  stop(): void;
  /** Ends it and drops the audio. */
  cancel(): void;
}

const TICK_MS = 100;

/** A refusal by the person, the OS or the policy of the window means no permission; a missing device is its own case. */
export function micProblem(e: unknown): MicProblem | null {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  return null;
}

/** Processing that rewrites the voice (noise suppression, automatic gain) is off: the clone should sound like the speaker, not like a call. */
const AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as const;

/**
 * Records the microphone with MediaRecorder, reports the level for the meter, stops by itself at 30 s and decodes the result into a
 * take (24 kHz mono WAV). The audio is kept in memory only; nothing is written to disk.
 * `signal` aborts a start that is still waiting for the permission prompt: the stream that arrives late is stopped at once and the call rejects with AbortError.
 */
export async function startRecording(events: RecorderEvents, signal?: AbortSignal): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
  if (signal?.aborted) {
    for (const t of stream.getTracks()) t.stop();
    throw new DOMException("Recording was cancelled before the microphone answered.", "AbortError");
  }
  const meter = new AudioContext();
  const analyser = meter.createAnalyser();
  meter.createMediaStreamSource(stream).connect(analyser);
  const block = new Float32Array(analyser.fftSize);
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const started = performance.now();
  let keep = true;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(block);
    const elapsed = performance.now() - started;
    events.onTick(Math.min(elapsed, CLONE_MAX_MS), meterLevel(rms(block)));
    if (elapsed >= CLONE_MAX_MS) recorder.stop();
  }, TICK_MS);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    clearInterval(timer);
    for (const t of stream.getTracks()) t.stop();
    void meter.close();
    if (!keep) return;
    new Blob(chunks)
      .arrayBuffer()
      .then((b) => decodeTake(new Uint8Array(b), "Recording"))
      .then(events.onDone, () => events.onFailed(null, "The recording could not be read. Try recording again."));
  };
  recorder.start();
  return {
    stop: () => recorder.state !== "inactive" && recorder.stop(),
    cancel: () => {
      keep = false;
      if (recorder.state !== "inactive") recorder.stop();
    },
  };
}
