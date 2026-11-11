const SAMPLE_RATE = 16000;
// Speech edges from the VAD are tight; Whisper drops the first and last word without a little room around them.
const MARGIN = Math.round(SAMPLE_RATE * 0.2);
// The VAD reports times in centiseconds.
const CS_TO_SAMPLES = SAMPLE_RATE / 100;

/** The part of a recording to transcribe: from the start of the first speech segment to the end of the last, with a margin, kept inside the audio. Undefined when there is no speech. */
export function speechRange(segments: readonly { t0: number; t1: number }[], total: number): { from: number; to: number } | undefined {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return undefined;
  return { from: Math.floor(Math.max(0, first.t0 * CS_TO_SAMPLES - MARGIN)), to: Math.ceil(Math.min(total, last.t1 * CS_TO_SAMPLES + MARGIN)) };
}
