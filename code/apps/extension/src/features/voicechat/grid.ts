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

/** The dots of one frame, row by row; `set` ignores points outside the grid. */
class Dots {
  readonly tones: Tone[];
  readonly cols: number;
  constructor(cols: number) {
    this.cols = cols;
    this.tones = Array.from({ length: ROWS * cols }, () => 0 as Tone);
  }
  set(r: number, c: number, t: Tone) {
    if (r >= 0 && r < ROWS && c >= 0 && c < this.cols) this.tones[r * this.cols + c] = t;
  }
  /** A column of `rows[1]` dots that starts at row `rows[0]`. */
  column(c: number, rows: [from: number, count: number], t: Tone) {
    for (let k = 0; k < rows[1]; k++) this.set(rows[0] + k, c, t);
  }
}

/** One mid column sweeping left to right with a dim one behind it. */
function connecting(g: Dots, tick: number) {
  const c = tick % g.cols;
  g.column(c, [0, ROWS], 2);
  g.column(c - 1, [0, ROWS], 1);
}

/** Centre bars, 2 dots high when quiet and up to 4 when loud, wider with the level. */
function listening(g: Dots, level: number) {
  const mid = (g.cols - 1) / 2;
  const reach = Math.round(mid * (0.3 + 0.7 * level));
  const peak = level > 0.5 ? 4 : 2;
  for (let c = 0; c < g.cols; c++) {
    const d = Math.abs(c - mid);
    if (d > reach) continue;
    const h = d <= reach / 2 ? peak : 2;
    g.column(c, [(ROWS - h) / 2, h], 2);
  }
}

/** A sparse diagonal wave that travels across the grid. */
function thinking(g: Dots, tick: number) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < g.cols; c++) if ((((c - tick + r * 2) % 7) + 7) % 7 === 0) g.set(r, c, 2);
}

/** Equaliser columns that grow from the bottom row with the model's voice. */
function speaking(g: Dots, level: number, tick: number) {
  if (level < 0.02) return;
  const mid = (g.cols - 1) / 2;
  for (let c = 0; c < g.cols; c++) {
    const wobble = 0.55 + 0.45 * Math.sin(Math.abs(c - mid) * 0.9 + tick * 0.7);
    const h = Math.max(1, Math.min(ROWS, Math.round(level * ROWS * wobble)));
    g.column(c, [ROWS - h, h], 3);
  }
}

/** A bright row that sweeps down the whole grid and back up, with a dim row on each side: a scanner. */
function looking(g: Dots, tick: number) {
  const period = ROWS * 2 - 2;
  const k = tick % period;
  const r = k < ROWS ? k : period - k;
  for (let c = 0; c < g.cols; c++) {
    g.set(r - 1, c, 1);
    g.set(r + 1, c, 1);
    g.set(r, c, 3);
  }
}

/** Dot tones row by row (ROWS x cols). Every pattern except `thinking` is symmetrical about the centre column. */
export function gridPattern({ phase, muted, level, tick, cols = COLS }: GridInput): Tone[] {
  const g = new Dots(cols);
  const lv = Math.min(1, Math.max(0, level));
  if (muted && phase !== "looking") return g.tones; // looking is shown whatever the microphone does: it is the sign that the screen is being captured
  if (phase === "connecting" || phase === "reconnecting") connecting(g, tick);
  else if (phase === "listening") listening(g, lv);
  else if (phase === "thinking") thinking(g, tick);
  else if (phase === "speaking") speaking(g, lv, tick);
  else if (phase === "looking") looking(g, tick);
  else if (phase === "idle") for (let c = 0; c < cols; c++) g.set(2, c, 1);
  return g.tones;
}
