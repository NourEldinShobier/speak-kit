import type { Clip, DictationDeps, DictationErrorCode } from "./types";

/** Failures that came before any text existed, so the recording is the only copy of what was said. */
export const NEEDS_AUDIO: ReadonlySet<DictationErrorCode> = new Set(["model-missing", "model-loading", "model-failed", "transcribe-failed", "failed"]);

/** Opens the microphone; the error code when it cannot be used. A recorder that throws is a microphone that cannot be used. */
export async function tryStart(deps: DictationDeps, prerollMs: number): Promise<DictationErrorCode | undefined> {
  try {
    const started = await deps.recorder.start({ prerollMs });
    return started.ok ? undefined : started.code;
  } catch {
    return "mic-failed";
  }
}

/** Tells the app a take is dealt with: `done` unless the speech engine failed before any text existed, which keeps the audio. Never throws. */
export function reportSettled(deps: Pick<DictationDeps, "settled">, clip: Clip, error: DictationErrorCode | undefined): void {
  try {
    deps.settled?.(clip, !(error && NEEDS_AUDIO.has(error)));
  } catch {
    // the app's bookkeeping must not stop the queue
  }
}
