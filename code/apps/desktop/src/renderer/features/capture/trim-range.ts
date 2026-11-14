import { MIN_TRIM_MS } from "../../../shared/capture/contract";

/** Moves the start or the end of a range of time (a trim or a zoom), keeping at least `minMs` (the shortest trim by default) between them and both inside the recording. */
export function clampTrim(r: { startMs: number; endMs: number }, move: { which: "start" | "end"; ms: number; durationMs: number; minMs?: number }): { startMs: number; endMs: number } {
  const { which, ms, durationMs, minMs = MIN_TRIM_MS } = move;
  if (which === "start") return { startMs: Math.max(0, Math.min(ms, r.endMs - minMs)), endMs: r.endMs };
  return { startMs: r.startMs, endMs: Math.min(durationMs, Math.max(ms, r.startMs + minMs)) };
}
