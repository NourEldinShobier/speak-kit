import type { EngineState } from "@speakkit/protocol";

export type NoticeKind = "download" | "error";
export interface Notice {
  kind: NoticeKind;
  title: string;
  body: string;
}

/** Lumen rule (NO1): at most one toast per kind per 10 minutes. */
export const THROTTLE_MS = 10 * 60_000;

/**
 * Native notifications (no buttons, per Lumen NO1): the model finished downloading, or the engine failed.
 * Returns the notice to show for the transition `prev -> next`, or null.
 */
export function noticeFor(
  prev: EngineState | undefined,
  next: EngineState,
  detail: string | undefined,
  opts: { download: boolean; error: boolean },
  lastSent: Partial<Record<NoticeKind, number>>,
  nowMs: number,
): Notice | null {
  let n: Notice | null = null;
  if (prev === "downloading" && next !== "downloading" && next !== "error" && next !== "missing" && opts.download)
    n = { kind: "download", title: "Voice model downloaded", body: "Kokoro is on this computer. SpeakKit works offline. Click to open." };
  else if (next === "error" && prev !== "error" && opts.error)
    n = { kind: "error", title: "Voice engine problem", body: `${detail ?? "The engine stopped."} Click to open SpeakKit.` };
  if (!n) return null;
  const last = lastSent[n.kind];
  if (last !== undefined && nowMs - last < THROTTLE_MS) return null;
  return n;
}
