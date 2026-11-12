import type { Row } from "@speakkit/meetings/pure";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n: number) => String(n).padStart(2, "0");
const startOfDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "Today", "Yesterday", then "Nov 9" (with the year when it is not this year). */
export function dayLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const d = new Date(at);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() === new Date(now).getFullYear() ? "" : `, ${d.getFullYear()}`}`;
}

/** 2:10 PM */
export function timeText(at: number): string {
  const d = new Date(at);
  const h = d.getHours();
  return `${h % 12 || 12}:${two(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** The rows in order, grouped by the day they started. Order inside a day is kept. */
export function groupByDay<T extends { startedAt: number }>(rows: readonly T[], now: number): { label: string; rows: T[] }[] {
  const groups: { label: string; rows: T[] }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.startedAt, now);
    const last = groups.at(-1);
    if (last?.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }
  return groups;
}

/** 38 min, 1 h 05 min, under a minute. */
export function lengthText(sec: number): string {
  const m = Math.round(sec / 60);
  if (sec < 60) return "under a minute";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${two(m % 60)} min`;
}

/** 04:12 for the running timer, 1:04:12 past the hour. */
export function timerText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = two(Math.floor((s % 3600) / 60));
  return h ? `${h}:${mm}:${two(s % 60)}` : `${mm}:${two(s % 60)}`;
}

const MARKS: Record<string, string> = { teams: "Tm", zoom: "Zm", meet: "Gm", slack: "Sl", discord: "Dc", manual: "Mt" };

/** The two letters of an app's mark in a row. */
export const markOf = (providerId: string, name: string): string =>
  MARKS[providerId] ??
  (name
    .trim()
    .slice(0, 2)
    .replace(/^./, (c) => c.toUpperCase()) ||
    "Mt");

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Slack huddle · recording now", "Microsoft Teams · 38 min · 3 chapters". */
export function subtitle(r: Row, live: boolean): string {
  if (live) return `${r.providerName} · recording now`;
  if (r.status === "transcribing") return `${r.providerName} · making the transcript`;
  const parts = [r.providerName];
  if (r.status === "done" || r.durationSec > 0) parts.push(lengthText(r.durationSec));
  if (r.notes.chapters > 0) parts.push(plural(r.notes.chapters, "chapter", "chapters"));
  return parts.join(" · ");
}

const daysText = (n: number) => (n === 365 ? "1 year" : plural(n, "day", "days"));

/** The line under the list: how many, and how long they are kept. */
export function footerText(count: number, c: { textDays: number; audioHours: number; trashDays?: number }): string {
  const hours = c.audioHours % 24 === 0 && c.audioHours >= 48 ? daysText(c.audioHours / 24) : plural(c.audioHours, "hour", "hours");
  const kept = c.textDays === 0 ? "Transcripts are kept until you delete them" : `Transcripts move to Trash after ${daysText(c.textDays)}`;
  return `${plural(count, "meeting", "meetings")}. ${kept} and audio is deleted after ${hours}.`;
}

export function sizeText(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
