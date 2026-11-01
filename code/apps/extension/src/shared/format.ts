/** m:ss (h:mm:ss from one hour), clamped at 0. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const timeLeft = (elapsedMs: number, totalMs: number) => `${clock(totalMs - elapsedMs)} left`;
export const speedLabel = (v: number) => `${Number(v.toFixed(2))}x`;
export const clampSpeed = (v: number) => Math.min(3, Math.max(0.5, Math.round(v * 10) / 10));
export const hostOf = (url?: string) => {
  try { return new URL(url ?? "").hostname || ""; } catch { return ""; }
};
/** About 15 characters per second at 1x (architecture.md estimate). */
export const estimateMs = (chars: number, speed: number) => Math.round((chars / 15 / Math.max(0.1, speed)) * 1000);
export const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`;
/** "9 min left" for the dock text; under a minute reads "Under 1 min left". */
export const minutesLeft = (ms: number) => (ms < 60000 ? "Under 1 min left" : `${Math.round(ms / 60000)} min left`);
/** ~190 words per minute at 1.2x (design copy), scaled linearly. */
export const wordsPerMinute = (speed: number) => Math.round((190 / 1.2) * speed);

/** Contrast ratio of two #RRGGBB colors (WCAG), one decimal. */
export function contrast(a: string, b: string): string {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const x = lum(a), y = lum(b);
  return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(1);
}
