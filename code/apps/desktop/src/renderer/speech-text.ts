import { SPOKEN_LANGUAGE_LABELS } from "../shared/speech-models/config";
import type { AccuracyFigure, ModelCard, SpeechModelsView } from "../shared/speech-models/contract";

export const languageName = (code: string): string => SPOKEN_LANGUAGE_LABELS[code] ?? code;

/** "574 MB", "1.2 GB". File size, never memory. */
export function sizeText(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

/** The figure of one language, or undefined when the model was not run on it. */
export const figureIn = (c: ModelCard, language: string): AccuracyFigure | undefined => c.accuracy?.find((f) => f.language === language);

/** The figure shown on a card: the language asked for when the model was run on it, else English, else any. */
const shownFigure = (c: ModelCard, language: string): AccuracyFigure | undefined => figureIn(c, language) ?? figureIn(c, "en") ?? c.accuracy?.[0];

/** "About 1 wrong word in 25 (English test)" or, when the sample had none, "No wrong word in 79 test words (English test)". */
export function figureText(f: AccuracyFigure): string {
  const test = `${languageName(f.language)} test`;
  return f.wrong === 0 ? `No wrong word in ${f.of} test words (${test})` : `About 1 wrong word in ${Math.round(f.of / f.wrong)} (${test})`;
}

/** "About 1 wrong word in 25 (English test)". The test language is always named, so figures of different languages are never lined up on one scale. */
export function accuracyText(c: ModelCard, language = "en"): string {
  const f = shownFigure(c, language);
  return f ? figureText(f) : "Not measured";
}

/** Strictly one language, for the compare table: a model that was not run on it says so. */
export function accuracyIn(c: ModelCard, language: string): string {
  const f = figureIn(c, language);
  return f ? figureText(f) : `Not measured in ${languageName(language)}`;
}

/** Share of words heard right in the test recordings: the length of the accuracy bar. */
export function accuracyPercent(c: ModelCard, language = "en"): number | undefined {
  const f = shownFigure(c, language);
  return f ? Math.round((1 - f.wrong / f.of) * 100) : undefined;
}

/** Share of a ten second sentence's time that is saved: the length of the speed bar (2 seconds is 80, 10 or more is 0). */
export const speedPercent = (c: ModelCard): number | undefined => (c.speedSeconds === undefined ? undefined : Math.round(Math.min(1, Math.max(0, 1 - c.speedSeconds / 10)) * 100));

/** "Under a second" / "About 2.5 seconds" / "About 90 seconds": whole seconds from ten up. */
export const secondsText = (n: number): string => (n <= 1 ? "Under a second" : `About ${n < 10 ? n : Math.round(n)} seconds`);

/** "Under a second" / "About 2 seconds on this computer's graphics card, 5 seconds on the CPU alone". */
export function speedText(c: ModelCard): string {
  if (c.speedSeconds === undefined) return "Not measured";
  if (c.speedOnCpuSeconds === undefined) return secondsText(c.speedSeconds);
  return `${secondsText(c.speedSeconds)} with a graphics card, ${secondsText(c.speedOnCpuSeconds).toLowerCase()} on the CPU alone`;
}

/** The sentence that goes next to every measured figure: what it rests on. */
export function sampleText(s: SpeechModelsView["sample"]): string {
  const part = (code: string) => `${s.recordings[code]} ${languageName(code)} (${s.words[code]} words)`;
  return `Measured by us on a small sample: ${part("en")}, ${part("de")} and ${part("ar")} recordings, on ${s.machine}. A computer with a slower processor or card is slower, and other speech will differ.`;
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
  const recommended = (m: ModelCard) => Number(!(f.language === "all" ? m.recommendedFor.length > 0 : m.recommendedFor.includes(f.language)));
  const keys: Record<Filter["sort"], (m: ModelCard) => number> = { recommended, size: (m) => m.bytes, speed: (m) => m.speedSeconds ?? Infinity };
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
  const speed = card?.speedSeconds !== undefined ? ` ${secondsText(card.speedSeconds)} on this computer.` : "";
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

function statusText(c: ModelCard): string {
  if (c.inUse) return "In use";
  return c.installed ? "Installed" : "Not downloaded";
}

export const MAX_COMPARED = 4;

/** What the compare picker starts with: the model in use, then the recommended ones, then the rest, up to the limit. */
export function defaultCompare(cards: readonly ModelCard[], max = MAX_COMPARED): string[] {
  const rank = (c: ModelCard) => {
    if (c.inUse) return 0;
    return c.recommendedFor.length > 0 ? 1 : 2;
  };
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .slice(0, max)
    .map((x) => x.c.id);
}

/** Languages some model was measured in: the choices of the compare table's test language. */
export const compareLanguages = (cards: readonly ModelCard[]): string[] => [...new Set(cards.flatMap((c) => c.accuracy?.map((f) => f.language) ?? []))];

/** The picked ids after a click: a model leaves the list, or joins it while there is room. */
export function togglePicked(picked: readonly string[], id: string, max = MAX_COMPARED): string[] {
  if (picked.includes(id)) return picked.filter((x) => x !== id);
  return picked.length < max ? [...picked, id] : [...picked];
}

export interface CompareTable {
  names: string[];
  rows: { label: string; cells: string[] }[];
}

/** Side by side: the same facts as the cards, one column per model in the order given. Accuracy is for one test language, named in every cell. */
export function compareTable(cards: readonly ModelCard[], language = "en"): CompareTable {
  const row = (label: string, f: (c: ModelCard) => string) => ({ label, cells: cards.map(f) });
  return {
    names: cards.map((c) => c.name),
    rows: [
      row("Accuracy", (c) => accuracyIn(c, language)),
      row("Speed", speedText),
      row("Languages", (c) => languagesText(c.languages, 6)),
      row("File size", (c) => sizeText(c.bytes)),
      row("Recommended", (c) => recommendedText(c).replace(/^for /, "") || "Not for a language"),
      row("Licence", (c) => c.license.name),
      row("Status", (c) => statusText(c)),
    ],
  };
}
