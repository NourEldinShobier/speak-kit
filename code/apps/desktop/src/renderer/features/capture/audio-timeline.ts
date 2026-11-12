/** A gap shorter than this is device latency, not lost sound (the main process corrects a fixed lag on top). */
export const GAP_TOLERANCE_MS = 250;

export interface AudioTimeline {
  /**
   * A block of `samples` arrived at `nowMs`. Returns how many samples of silence must go before it so that the sound lands where it was heard on
   * the recording's clock: the microphone opens after the picture starts, and a reopened device leaves a hole.
   */
  padBefore(nowMs: number, samples: number): number;
  /** Samples of sound handed on so far, silence included. */
  readonly total: number;
}

/** Keeps the microphone track on the same clock as the video: sample 0 is the moment the picture started. */
export function createAudioTimeline(rate: number, startedAtMs: number): AudioTimeline {
  let total = 0;
  return {
    padBefore(nowMs, samples) {
      const expected = Math.round(((nowMs - startedAtMs) * rate) / 1000);
      const gap = expected - (total + samples);
      const pad = gap * 1000 > GAP_TOLERANCE_MS * rate ? gap : 0;
      total += pad + samples;
      return pad;
    },
    get total() {
      return total;
    },
  };
}
