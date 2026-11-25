import { MAX_VERSIONS } from "@speakkit/dictation";
import type { HistoryItem, ModelView } from "../../../shared/dictation/contract";
import { DICTATION_LANGUAGES, type DictationConfig } from "../../../shared/dictation/settings";
import { SPOKEN_LANGUAGE_LABELS } from "../../../shared/speech-models/config";

export const RETENTION_OPTIONS: { value: DictationConfig["retention"]; label: string }[] = [
  { value: "off", label: "Do not keep" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "forever", label: "Forever" },
];

export const LANGUAGE_OPTIONS: { value: DictationConfig["language"]; label: string }[] = DICTATION_LANGUAGES.map((value) => ({ value, label: SPOKEN_LANGUAGE_LABELS[value] ?? value }));

/** Shown once an entry holds the most versions: the next "Transcribe again" replaces the oldest one that is neither the original nor in use. */
export const versionsCapNote = (count: number): string => (count >= MAX_VERSIONS ? "Oldest other version is replaced." : "");

export const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

export const modelLine = (m: ModelView) => `${mb(m.bytes)}. ${m.description}`;

/** "About 2 minutes left." / "Less than a minute left." / "" when there is no estimate yet. */
export function etaText(seconds: number | undefined): string {
  if (seconds === undefined) return "";
  if (seconds < 60) return "Less than a minute left.";
  const minutes = Math.round(seconds / 60);
  return `About ${minutes} ${minutes === 1 ? "minute" : "minutes"} left.`;
}

/** "Downloading 38%, 307 of 809 MB. About 2 minutes left." */
export function downloadText(m: ModelView): string {
  const p = m.progress?.kind === "downloading" ? m.progress : { fraction: 0, etaSeconds: undefined };
  const done = Math.round((p.fraction * m.bytes) / 1e6);
  return [`Downloading ${Math.round(p.fraction * 100)}%, ${done} of ${Math.round(m.bytes / 1e6)} MB.`, etaText(p.etaSeconds)].filter(Boolean).join(" ");
}

/** "9:41 PM" in the person's own clock. */
export const timeText = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const startOfDay = (t: number) => new Date(new Date(t).setHours(0, 0, 0, 0)).getTime();

/** "Today", "Yesterday", or the date. */
export function dayLabel(at: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export interface DayGroup {
  label: string;
  items: HistoryItem[];
}

/** Entries are newest first; consecutive ones of the same day share a group. */
export function groupByDay(items: readonly HistoryItem[], now: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const label = dayLabel(item.at, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** "notepad.exe" becomes "Notepad". */
export function appName(exe: string | undefined): string {
  const name = (exe ?? "").replace(/\.exe$/i, "");
  return name ? name[0]!.toUpperCase() + name.slice(1) : "";
}

const KEEP_TEXT: Record<DictationConfig["retention"], string> = { off: "", "24h": "for 24 hours", "7d": "for 7 days", "30d": "for 30 days", forever: "until you delete it" };
const OLD_TEXT: Record<DictationConfig["retention"], string> = { off: "", "24h": "24 hours", "7d": "7 days", "30d": "30 days", forever: "" };

export const historyLead = (r: DictationConfig["retention"]) => (r === "off" ? "History is off. New dictations are not saved." : `What you dictated, saved on this computer ${KEEP_TEXT[r]}.`);

/** The sentence under "Nothing dictated yet". */
export function emptyHint(r: DictationConfig["retention"]): string {
  const lead = "Hold the hotkey in any app and speak.";
  if (r === "off") return `${lead} History is off, so nothing is saved.`;
  return r === "forever" ? `${lead} What you dictate shows up here.` : `${lead} What you dictate shows up here ${KEEP_TEXT[r]}.`;
}

export function historyFooter(shown: number, total: number, r: DictationConfig["retention"]): string {
  const old = OLD_TEXT[r] ? ` Entries older than ${OLD_TEXT[r]} are removed.` : "";
  const count = shown === total ? `${entriesText(total)}.` : `Showing ${shown} of ${total}.`;
  return `${count}${old}`;
}

export const entriesText = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

/** The description of the Hotkey row: while the keys are being captured it says how to get out, because every key is taken by the capture. */
export const hotkeyHelp = (capturing: boolean) => (capturing ? "Press the keys you want to use. Esc cancels." : "Works while any app is in front.");

/** The entry that should get keyboard focus after `removed` is deleted: the next one down, else the one above it, else none. */
export function focusAfterDelete(ids: readonly string[], removed: string): string | undefined {
  const i = ids.indexOf(removed);
  return i < 0 ? undefined : (ids[i + 1] ?? ids[i - 1]);
}

/** Part of an entry's text, for the name of its buttons, so a screen reader can tell the rows apart. */
export const entryLabel = (text: string, max = 40): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}\u2026` : flat;
};

/** The program name shown for an entry: its file description when it has one, else the executable name made readable. */
export const rowApp = (item: Pick<HistoryItem, "app" | "appName">): string => item.appName || appName(item.app);

/** Short notes on an entry that did not go the usual way. */
export function rowTags(item: Pick<HistoryItem, "kind" | "outcome">): string[] {
  const tags: string[] = [];
  if (item.kind === "interrupted") tags.push("Cut short");
  if (item.kind === "restored") tags.push("Recovered");
  if (item.outcome === "copied") tags.push("Copied only");
  if (item.outcome === "failed") tags.push("Not inserted");
  return tags;
}

/** How long the entry took to transcribe and how much silence was cut, as short notes; none for an entry from before they were stored. */
export function timingTags(item: Pick<HistoryItem, "timings">): string[] {
  const t = item.timings;
  const tags: string[] = [];
  if (t?.transcribeMs !== undefined) tags.push(`Transcribed in ${t.transcribeMs < 1000 ? `${Math.round(t.transcribeMs)} ms` : `${(t.transcribeMs / 1000).toFixed(1)} s`}`);
  if (t?.pausesDroppedMs) tags.push(`${(t.pausesDroppedMs / 1000).toFixed(1)} s of silence skipped`);
  return tags;
}

/** The selection with `id` ticked or unticked; `null` (selection off) becomes a selection of just that entry. */
export function toggled(picked: ReadonlySet<string> | null, id: string): Set<string> {
  const next = new Set(picked);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** The tag under an entry that went through the rewrite pass, or nothing. */
export function rewriteTag(outcome: HistoryItem["rewrite"]): string | undefined {
  switch (outcome) {
    case "rewritten":
      return "Rewritten";
    case "skipped":
      return "Pasted as said (skipped)";
    case "writer-loading":
      return "Pasted as said (writer was loading)";
    case "failed":
      return "Pasted as said, the writer could not be reached";
    case "numbers-only":
      return "Not rewritten, only numbers";
    case "changed-facts":
      return "Pasted as said, the rewrite changed a number";
    case "changed-style":
      return "Pasted as said, the rewrite changed capital letters";
    case "changed-words":
      return "Pasted as said, the rewrite changed words it was not asked to";
    default:
      return undefined;
  }
}

/** The note under an entry that stored corrections changed: the first fix, and how many more. */
export function correctedTag(fixes: readonly { heard: string; correct: string }[]): string {
  const [first] = fixes;
  if (!first) return "";
  const more = fixes.length > 1 ? ` and ${fixes.length - 1} more` : "";
  return `Corrected ${first.heard} → ${first.correct}${more}`;
}

/** "0:06" for a recording length. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "Removed in 3 days" under each history entry. */
export function expiryText(ms: number | null, what = "Removed"): string {
  if (ms === null) return "Kept for ever";
  if (ms < MIN) return `${what} in less than a minute`;
  if (ms < HOUR) return `${what} in ${plural(Math.ceil(ms / MIN), "minute")}`;
  if (ms < DAY) return `${what} in ${plural(Math.ceil(ms / HOUR), "hour")}`;
  return `${what} in ${plural(Math.ceil(ms / DAY), "day")}`;
}

/** The words around the shortcut's keys in the hint at the top of the page: what to press, and what happens next. A tap-to-start shortcut says press twice; every other mode starts by holding. */
export function usageHint(mode: string, enabled: boolean): { before: string; after: string } {
  const on = enabled ? "" : "Turn dictation on, then ";
  if (mode === "double-tap") return { before: `${on}${on ? "double-tap" : "Double-tap"}`, after: "in any app to start, speak, then press it once to stop." };
  return mode === "toggle"
    ? { before: `${on}${on ? "press" : "Press"}`, after: "in any app to start, speak, then press it again to stop." }
    : { before: `${on}${on ? "hold" : "Hold"}`, after: "in any app, speak, then let go." };
}
