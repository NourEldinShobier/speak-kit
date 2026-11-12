export interface InkPoint {
  x: number;
  y: number;
  at: number;
}

export interface Stroke {
  points: InkPoint[];
  /** A pointer trail (no button down): it fades much faster than ink. */
  laser: boolean;
}

export const LASER_FADE_MS = 500;
export const INK_COLOR = "#e5484d";

/** Opacity of a point `age` ms after it was drawn. `fadeMs` of 0 means it stays until cleared; the last 40 % of the time is the fade. */
export function alphaOf(age: number, fadeMs: number): number {
  if (age < 0) return 1;
  if (fadeMs <= 0) return 1;
  const solid = fadeMs * 0.6;
  if (age <= solid) return 1;
  return Math.max(0, 1 - (age - solid) / (fadeMs - solid));
}

/** Drops the points that are fully faded, and the strokes left empty. Mutates `strokes`. Returns how many points were dropped. */
export function prune(strokes: Stroke[], now: number, fadeMs: number): number {
  let dropped = 0;
  for (const s of strokes) {
    const life = s.laser ? LASER_FADE_MS : fadeMs;
    if (life <= 0) continue;
    const keep = s.points.filter((p) => now - p.at < life);
    dropped += s.points.length - keep.length;
    s.points = keep;
  }
  for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i]!.points.length === 0) strokes.splice(i, 1);
  return dropped;
}

/** Draws every stroke as short segments, each with the opacity of its newer end. */
export function drawInk(ctx: CanvasRenderingContext2D, strokes: Stroke[], clock: { now: number; fadeMs: number }): void {
  const { now, fadeMs } = clock;
  prune(strokes, now, fadeMs);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = s.laser ? 6 : 4;
    ctx.shadowColor = s.laser ? INK_COLOR : "transparent";
    ctx.shadowBlur = s.laser ? 12 : 0;
    for (let i = 1; i < s.points.length; i++) {
      const a = s.points[i - 1]!;
      const b = s.points[i]!;
      ctx.globalAlpha = alphaOf(now - b.at, s.laser ? LASER_FADE_MS : fadeMs);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
