import type { EngineState } from "@speakkit/protocol";
import type { NotifyEvent } from "../shared/schemas";

export interface Notice {
  event: NotifyEvent;
  /** Identifies the task the toast is about, so repeats of the same task are throttled together. */
  taskKey: string;
  title: string;
  body: string;
}

/** What an engine state change is worth telling the user: the model finished downloading, or the engine failed. */
export function noticeFor(prev: EngineState | undefined, next: EngineState, detail: string | undefined): Notice | null {
  if (prev === "downloading" && next !== "downloading" && next !== "error" && next !== "missing")
    return { event: "download-done", taskKey: "kokoro", title: "Voice model downloaded", body: "Kokoro is on this computer. SpeakKit works offline. Click to open." };
  if (next === "error" && prev !== "error")
    return { event: "engine-error", taskKey: "kokoro", title: "Voice engine problem", body: `${detail ?? "The engine stopped."} Click to open SpeakKit.` };
  return null;
}
