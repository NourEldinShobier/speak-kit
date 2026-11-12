import { MIN_TRIM_MS } from "../../../shared/capture/contract";

/** Moves the start or the end of a trim range, keeping at least the shortest piece between them and both inside the recording. */
export function clampTrim(r: { startMs: number; endMs: number }, move: { which: "start" | "end"; ms: number; durationMs: number }): { startMs: number; endMs: number } {
  const { which, ms, durationMs } = move;
  if (which === "start") return { startMs: Math.max(0, Math.min(ms, r.endMs - MIN_TRIM_MS)), endMs: r.endMs };
  return { startMs: r.startMs, endMs: Math.min(durationMs, Math.max(ms, r.startMs + MIN_TRIM_MS)) };
}
