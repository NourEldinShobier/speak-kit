import type { EngineState } from "@speakkit/protocol";
import type { NotifyEvent } from "../shared/schemas";

interface Notice {
  event: NotifyEvent;
  /** Identifies the task the toast is about, so repeats of the same task are throttled together. */
  taskKey: string;
  title: string;
  body: string;
}

/** What an engine state change is worth telling the user: only a failure. Becoming ready is never announced. */
export function noticeFor(prev: EngineState | undefined, next: EngineState, detail: string | undefined): Notice | null {
  if (next === "error" && prev !== "error") return { event: "engine-error", taskKey: "kokoro", title: "Voice engine problem", body: `${detail ?? "The engine stopped."} Click to open Speak Kit.` };
  return null;
}
