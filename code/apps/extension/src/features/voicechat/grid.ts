import type { VoicePhase } from "@speakkit/protocol";

export const ROWS = 4;
export const COLS = 15;
export const COLS_NARROW = 9;
/** 0 off, 1 dim, 2 mid, 3 on: the four dot colours of the design. */
export type Tone = 0 | 1 | 2 | 3;

export interface GridInput {
  phase: VoicePhase;
  muted: boolean;
  /** 0 to 1 */
  level: number;
  /** animation step, one per 100 ms */
  tick: number;
  cols?: number;
}

/** Dot tones row by row (rows x cols). Every pattern except `thinking` is symmetrical about the centre column. */
export function gridPattern({ phase, muted, level, tick, cols = COLS }: GridInput): Tone[] {
  const g = new Array<Tone>(ROWS * cols).fill(0);
  const set = (r: number, c: number, t: Tone) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < cols) g[r * cols + c] = t;
  };
  const mid = (cols - 1) / 2;
  const lv = Math.min(1, Math.max(0, level));
  if (muted) return g;
  if (phase === "connecting" || phase === "reconnecting") {
    const c = tick % cols;
    for (let r = 0; r < ROWS; r++) {
      set(r, c, 2);
      set(r, c - 1, 1);
    }
  } else if (phase === "listening") {
    const reach = Math.round((cols / 2 - 0.5) * (0.3 + 0.7 * lv));
    const peak = lv > 0.5 ? 4 : 2;
    for (let c = 0; c < cols; c++) {
      const d = Math.abs(c - mid);
      const h = d > reach ? 0 : d <= reach / 2 ? peak : 2;
      for (let k = 0; k < h; k++) set((ROWS - h) / 2 + k, c, 2);
    }
  } else if (phase === "thinking") {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) if ((((c - tick + r * 2) % 7) + 7) % 7 === 0) set(r, c, 2);
  } else if (phase === "speaking") {
    for (let c = 0; c < cols; c++) {
      const d = Math.abs(c - mid);
      const wobble = 0.55 + 0.45 * Math.sin(d * 0.9 + tick * 0.7);
      const h = lv < 0.02 ? 0 : Math.max(1, Math.min(ROWS, Math.round(lv * ROWS * wobble)));
      for (let k = 0; k < h; k++) set(ROWS - 1 - k, c, 3);
    }
  } else if (phase === "idle") for (let c = 0; c < cols; c++) set(2, c, 1);
  return g;
}
