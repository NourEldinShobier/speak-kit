/** The short tones dictation can play. */
export type SoundKind = "start" | "stop" | "error" | "cancel";

export interface Note {
  /** Start, in milliseconds from the first note. */
  at: number;
  ms: number;
  hz: number;
  /** 0 to 1 of full scale. */
  gain: number;
}

export interface SoundSettings {
  enabled: boolean;
  /** 0 to 100; 0 plays nothing. */
  volume: number;
}

// Every kind has its own loudness so the tones sit at one perceived level: the low error tone needs more gain than the high start tone.
const SHAPES: Record<SoundKind, { loudness: number; notes: readonly Omit<Note, "gain">[] }> = {
  start: { loudness: 0.16, notes: [{ at: 0, ms: 70, hz: 880 }] },
  stop: { loudness: 0.16, notes: [{ at: 0, ms: 70, hz: 660 }] },
  cancel: { loudness: 0.14, notes: [{ at: 0, ms: 60, hz: 520 }, { at: 70, ms: 60, hz: 390 }] },
  error: { loudness: 0.22, notes: [{ at: 0, ms: 90, hz: 330 }, { at: 110, ms: 120, hz: 247 }] },
};

/** The notes of a tone at the chosen volume; nothing when it is off or the volume is 0. */
export function tonesFor(kind: SoundKind, sounds: SoundSettings): Note[] {
  if (!sounds.enabled || sounds.volume <= 0) return [];
  const { loudness, notes } = SHAPES[kind];
  const gain = Math.min(1, loudness * (Math.min(100, sounds.volume) / 100) * 2);
  return notes.map((n) => ({ ...n, gain }));
}

type Phase = { status: string; mode?: string; notice?: { kind: string } };

/**
 * The tone for a change of the dictation state, or none. A recording starting plays the start tone and ending plays the stop tone; a failure plays
 * the error tone; a cancel plays its own. The same state twice plays nothing, so a refresh of the status makes no sound.
 */
export function soundFor(prev: Phase, next: Phase): SoundKind | undefined {
  const recording = (p: Phase) => p.status === "recording" || p.status === "locked";
  if (!recording(prev) && recording(next)) return "start";
  if (next.status === "error" && prev.status !== "error") return "error";
  if (next.status === "idle" && next.notice?.kind === "cancelled" && prev.notice?.kind !== "cancelled") return "cancel";
  if (recording(prev) && next.status === "transcribing") return "stop";
  return undefined;
}
