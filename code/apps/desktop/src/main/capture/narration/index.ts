/** One spoken stretch on the capture timeline (milliseconds since the capture started). */
export interface Segment {
  startMs: number;
  endMs: number;
}

export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SegmentOptions {
  rate: number;
  /** Block size for the energy measure. */
  blockMs?: number;
  /** RMS (0..1) at or above which a block counts as sound. Deliberately very low: quiet speech must reach the transcriber. */
  floor?: number;
  /** Sound this close together is one stretch. */
  mergeGapMs?: number;
  padMs?: number;
  /** Shorter stretches are clicks and bumps. */
  minMs?: number;
}

const rmsOf = (pcm: Int16Array, from: number, to: number): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += (pcm[i]! / 32768) ** 2;
  return Math.sqrt(sum / (to - from));
};

/** Runs of blocks whose loudness is at or above `floor`, in milliseconds. */
function soundRuns(pcm: Int16Array, { rate, block, floor }: { rate: number; block: number; floor: number }): Segment[] {
  const runs: Segment[] = [];
  let open: number | null = null;
  for (let at = 0; at < pcm.length; at += block) {
    const sound = rmsOf(pcm, at, Math.min(pcm.length, at + block)) >= floor;
    const ms = (at / rate) * 1000;
    if (sound && open === null) open = ms;
    else if (!sound && open !== null) {
      runs.push({ startMs: open, endMs: ms });
      open = null;
    }
  }
  if (open !== null) runs.push({ startMs: open, endMs: (pcm.length / rate) * 1000 });
  return runs;
}

const mergeRuns = (runs: readonly Segment[], gapMs: number): Segment[] => {
  const merged: Segment[] = [];
  for (const s of runs) {
    const last = merged[merged.length - 1];
    if (last && s.startMs - last.endMs <= gapMs) last.endMs = s.endMs;
    else merged.push({ ...s });
  }
  return merged;
};

/**
 * Cuts the microphone track into the stretches that hold any sound at all. Only near-digital silence is left out, never quiet speech: the
 * transcriber decides what is speech, not a loudness gate here.
 */
export function findSegments(pcm: Int16Array, o: SegmentOptions): Segment[] {
  const { rate, blockMs = 50, floor = 0.0008, mergeGapMs = 700, padMs = 250, minMs = 120 } = o;
  const totalMs = (pcm.length / rate) * 1000;
  const runs = soundRuns(pcm, { rate, block: Math.max(1, Math.round((rate * blockMs) / 1000)), floor });
  return mergeRuns(runs, mergeGapMs)
    .filter((s) => s.endMs - s.startMs >= minMs)
    .map((s) => ({ startMs: Math.max(0, s.startMs - padMs), endMs: Math.min(totalMs, s.endMs + padMs) }));
}

/** True when the last `ms` of the track is digital silence (every sample zero or one step off): the device is open but delivering nothing. */
export function digitalSilence(pcm: Int16Array, rate: number, ms: number): boolean {
  const n = Math.round((rate * ms) / 1000);
  if (n <= 0 || pcm.length < n) return false;
  for (let i = pcm.length - n; i < pcm.length; i++) if (Math.abs(pcm[i]!) > 1) return false;
  return true;
}

/** Words of one transcribed stretch, spread over the stretch by their length (the speech engine gives text only, so times inside a stretch are an estimate). */
export function wordsOf(text: string, seg: Segment): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const weights = parts.map((p) => Math.max(1, p.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(0, seg.endMs - seg.startMs);
  let at = seg.startMs;
  return parts.map((p, i) => {
    const end = i === parts.length - 1 ? seg.endMs : at + (span * weights[i]!) / sum;
    const w = { text: p, startMs: Math.round(at), endMs: Math.round(end) };
    at = end;
    return w;
  });
}

/** The microphone track runs behind the video by the capture latency; shift words earlier by it so they share the frames' timeline. */
export function correctLag(words: readonly Word[], lagMs: number): Word[] {
  return words.map((w) => ({ ...w, startMs: Math.max(0, w.startMs - lagMs), endMs: Math.max(0, w.endMs - lagMs) }));
}
