import { SPOKEN_LANGUAGE_LABELS } from "../shared/speech-models/config";
import type { ModelCard, SpeechModelsView } from "../shared/speech-models/contract";

export const languageName = (code: string): string => SPOKEN_LANGUAGE_LABELS[code] ?? code;

/** "574 MB", "1.2 GB". File size, never memory. */
export function sizeText(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

/** "About 1 wrong word in 25 (English test)". The test language is always named, so figures of different languages are never lined up on one scale. */
export function accuracyText(c: ModelCard): string {
  if (!c.accuracy) return "Not measured";
  return `About 1 wrong word in ${c.accuracy.oneIn} (${languageName(c.accuracy.testLanguage)} test)`;
}

/** "Under a second" / "About 2 seconds". */
export function speedText(c: ModelCard): string {
  if (c.speedSeconds === undefined) return "Not measured";
  if (c.speedSeconds <= 1) return "Under a second";
  return `About ${c.speedSeconds} seconds`;
}

/** "English, German, Arabic and more". Automatic detection is not a language. */
export function languagesText(codes: readonly string[], shown = 3): string {
  const names = codes.filter((c) => c !== "auto").map(languageName);
  if (names.length <= shown) return names.length === 2 ? `${names[0]} and ${names[1]}` : names.join(", ");
  return `${names.slice(0, shown).join(", ")} and more`;
}

/** Memory is only shown when it was measured on this computer, with the setup it was measured in. */
export function memoryText(c: ModelCard): string {
  return c.memory ? `${c.memory.mb} MB while running (${c.memory.setup})` : "Not measured";
}

/** "Recommended for English" / "Recommended for German and Arabic"; empty when it is not the recommended model of any language. */
export function recommendedText(c: ModelCard): string {
  const names = c.recommendedFor.filter((l) => l !== "auto").map(languageName);
  if (names.length === 0) return "";
  if (names.length <= 2) return `for ${names.join(" and ")}`;
  return `for ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** "About 3 minutes left." / "Less than a minute left." / "" while there is no estimate. */
export function etaText(seconds: number | undefined): string {
  if (seconds === undefined) return "";
  if (seconds < 60) return "Less than a minute left.";
  const m = Math.round(seconds / 60);
  return `About ${m} ${m === 1 ? "minute" : "minutes"} left.`;
}

/** "214 MB of 356 MB. About 3 minutes left." */
export function transferText(c: ModelCard): string {
  const t = c.transfer;
  if (!t) return "";
  if (t.state === "preparing") return "Getting the model ready. This takes a few seconds.";
  const done = sizeText(t.fraction * c.bytes);
  if (t.state === "paused") return `Paused at ${done} of ${sizeText(c.bytes)}. The part already downloaded is kept.`;
  return [`${done} of ${sizeText(c.bytes)}.`, etaText(t.etaSeconds)].filter(Boolean).join(" ");
}

/** The sentence under a failed download: what happened (it names the host) and that the part already there is kept. */
export function failureText(c: ModelCard): string {
  const f = c.failure;
  if (!f) return "";
  const kept = f.keptBytes > 0 && f.kind !== "checksum" ? ` ${sizeText(f.keptBytes)} are kept and the download resumes from there.` : "";
  return `${f.message}${kept}`;
}

export const FAILURE_BUTTONS: Record<string, string> = {
  "try-again": "Try again",
  "download-again": "Download again",
  "open-proxy-settings": "Open proxy settings",
  "free-space": "Show models folder",
};

/** Title and body of the delete confirmation: how much disk it frees, and what stops when it was the last model. */
export function deleteConfirm(c: ModelCard, view: Pick<SpeechModelsView, "models">): { title: string; body: string } {
  const last = view.models.filter((m) => m.installed).length <= 1;
  const frees = `This frees ${sizeText(Math.max(c.diskBytes, c.installed ? c.bytes : 0))} of disk space.`;
  const stops = c.inUse && last ? " Dictation stops until a model is downloaded." : "";
  const custom = c.origin === "custom" ? " The file you added it from is not touched." : "";
  return { title: `Delete ${c.name}?`, body: `${frees}${stops}${custom}` };
}

export type SortKey = "recommended" | "size" | "speed";
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended first" },
  { value: "size", label: "File size" },
  { value: "speed", label: "Speed" },
];

export interface Filter {
  downloadedOnly: boolean;
  /** A language code, or "all". */
  language: string;
  sort: SortKey;
}

export const DEFAULT_FILTER: Filter = { downloadedOnly: false, language: "all", sort: "recommended" };

/** Applies the filter and the sort. The model in use stays first whatever the sort, and a model is never ranked against another on accuracy. */
export function visibleModels(models: readonly ModelCard[], f: Filter): { shown: ModelCard[]; hidden: number } {
  const byLanguage = models.filter((m) => f.language === "all" || m.languages.includes(f.language));
  const filtered = f.downloadedOnly ? byLanguage.filter((m) => m.installed) : byLanguage;
  const keys: Record<Filter["sort"], (m: ModelCard) => number> = { recommended: () => 0, size: (m) => m.bytes, speed: (m) => m.speedSeconds ?? Infinity };
  const key = keys[f.sort];
  const shown = filtered
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Number(b.m.inUse) - Number(a.m.inUse) || key(a.m) - key(b.m) || a.i - b.i)
    .map((x) => x.m);
  return { shown, hidden: models.length - shown.length };
}

/** The line under the downloaded filter: how many models are hidden. */
export function hiddenLine(hidden: number): string {
  if (hidden === 0) return "";
  return hidden === 1 ? "1 model that is not downloaded is hidden." : `${hidden} models that are not downloaded are hidden.`;
}

export function recommendationText(v: SpeechModelsView): { title: string; body: string; model: string } | undefined {
  const r = v.recommendation;
  if (!r) return undefined;
  const name = v.names[r.model] ?? r.model;
  const card = v.models.find((m) => m.id === r.model);
  const speed = card ? ` ${speedText(card)} on this computer.` : "";
  return { title: `For ${languageName(r.language)}, we recommend ${name}`, body: `You dictate in ${languageName(r.language)}.${speed}`, model: r.model };
}

export const IDLE_LABELS: Record<number, string> = { 5: "After 5 minutes", 15: "After 15 minutes", 30: "After 30 minutes", 60: "After 60 minutes", 0: "Never" };

/** What the device row says: what runs where, and why, in plain words. */
export function deviceLine(v: SpeechModelsView): string {
  const d = v.device;
  const where = { gpu: `Running on ${d.gpuName ?? "the graphics card"}.`, cpu: "Running on the CPU." };
  const parts = [d.backend ? where[d.backend] : "Nothing is loaded now."];
  if (d.movedToCpuByMemory) parts.push("The graphics card ran out of memory, so speech moved to the CPU while idle. Only one copy is in memory, and the card is not marked as failed.");
  return parts.join(" ");
}

export function hardwareLine(v: SpeechModelsView): string {
  const d = v.device;
  const bits = [
    d.gpuName ? `${d.gpuName}${d.driver ? `, driver ${d.driver}` : ""}` : "No graphics card found",
    d.cores ? `${d.cores} processor threads` : "",
    d.memoryGb ? `${d.memoryGb} GB memory` : "",
  ].filter(Boolean);
  return bits.join(". ");
}
