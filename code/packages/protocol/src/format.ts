/** m:ss, or h:mm:ss from one hour; clamped at 0. Shared by the extension, the desktop reader and the library. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(m).padStart(2, "0")}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}
