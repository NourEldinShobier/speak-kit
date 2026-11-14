import type { EngineState } from "@speakkit/protocol";
import type { NotifyEvent } from "../shared/schemas";
import { at } from "../shared/i18n";
import "../shared/i18n/packs/main";

interface Notice {
  event: NotifyEvent;
  /** Identifies the task the toast is about, so repeats of the same task are throttled together. */
  taskKey: string;
  title: string;
  body: string;
}

/** What an engine state change is worth telling the user: only a failure. Becoming ready is never announced. */
export function noticeFor(prev: EngineState | undefined, next: EngineState, detail: string | undefined): Notice | null {
  if (next === "error" && prev !== "error")
    return { event: "engine-error", taskKey: "kokoro", title: at("toast.engineTitle"), body: at("toast.engineBody", { detail: detail ?? at("toast.engineStopped") }) };
  return null;
}
