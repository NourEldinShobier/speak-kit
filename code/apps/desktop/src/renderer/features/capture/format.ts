import type { CaptureItem, CaptureStatus } from "../../../shared/capture/contract";

export const formatBytes = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  const mb = n / 1e6;
  if (mb >= 10 || (mb >= 1 && Number.isInteger(mb))) return `${Math.round(mb)} MB`;
  if (n >= 1e5) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
};

export const duration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** "0:48 · 62 words · 14 MB", "0:23 · no narration · 9 MB" or "Picture · 1.4 MB". */
export function itemSubtitle(i: CaptureItem): string {
  if (i.finishing) return "Finishing";
  const size = formatBytes(i.bytes);
  if (i.kind === "screenshot") return `Picture · ${size}`;
  const words = i.wordCount === 0 ? "no narration" : `${i.wordCount} ${i.wordCount === 1 ? "word" : "words"}`;
  return `${duration(i.durationMs ?? 0)} · ${words} · ${size}`;
}

/** The chip on the right of a row: what happened to the capture, the most telling first. */
export function itemChip(i: CaptureItem): { label: string; tone: "sent" | "copied" | "saved" } {
  if (i.chips.includes("sent")) return { label: "Sent to Voice chat", tone: "sent" };
  if (i.chips.includes("copied")) return { label: "Copied", tone: "copied" };
  return { label: "Saved", tone: "saved" };
}

/** "5 captures. Kept for 30 days, then moved to the Recycle Bin." */
export function listFooter(count: number, days: number, platform: string): string {
  const noun = count === 1 ? "capture" : "captures";
  const bin = platform === "darwin" ? "Trash" : "Recycle Bin";
  return days > 0 ? `${count} ${noun}. Kept for ${days} days, then moved to the ${bin}.` : `${count} ${noun}. Kept until you delete them.`;
}

export const RETENTION_LABEL: Record<number, string> = { 7: "7 days", 30: "30 days", 90: "90 days", 0: "Forever" };
export const INK_LABEL: Record<number, string> = { 1000: "About 1 second", 3000: "About 3 seconds", 0: "Until cleared" };

/** What the page says about a capture that is not possible here, or null when it is. */
export function unavailable(s: CaptureStatus): string | null {
  if (!s.supported) return "Capture is not available on this computer yet.";
  if (s.permission === "denied") return "Speak Kit needs Screen Recording permission before it can capture. Open System Settings, allow Speak Kit, then try again.";
  return null;
}
