import type { SummariseResult, WriterFailure } from "./notes";

export type CompleteResult = { ok: true; text: string } | { ok: false; code: "no-key" | "key-rejected" | "no-credit" | "rate-limited" | "offline" | "unavailable" };

export interface NotesDeps {
  /** One chat completion that answers with JSON. The caller owns the key, the network and the model. */
  complete(system: string, user: string, signal: AbortSignal): Promise<CompleteResult>;
  /** The writer, named under the summary. */
  writer: string;
  /** How long the pass may take; the transcript stays as it is when it is exceeded. */
  timeoutMs?: number;
}

/** One spoken line as the writer reads it. */
export interface NoteLine {
  start: number;
  text: string;
}

type Notes = Extract<SummariseResult, { ok: true }>["notes"];

/** The transcript text sent to the writer is cut here (about 12k words): a longer transcript is summarised from its start and its end. */
const MAX_PROMPT_CHARS = 60_000;

const UNCHANGED = "The transcript and the audio are unchanged.";

/** What each failure says. All of them say that nothing else was touched, and what the person can do. */
export const NOTES_FAILURES: Record<string, string> = {
  "no-key": `Notes need your OpenAI key, which is not set. ${UNCHANGED} Add the key in Voice chat settings, then regenerate the notes.`,
  "key-rejected": `OpenAI did not accept the key. ${UNCHANGED} Check the key, then regenerate the notes.`,
  "no-credit": `Your OpenAI account has no credit left. ${UNCHANGED} Add credit, then regenerate the notes.`,
  "rate-limited": `OpenAI is busy right now. ${UNCHANGED} Regenerate the notes in a minute.`,
  offline: `The notes could not be written because OpenAI could not be reached. ${UNCHANGED} Regenerate the notes when you are online.`,
  unavailable: `OpenAI could not write the notes. ${UNCHANGED} Regenerate the notes to try again.`,
  unreadable: `The writer's answer could not be read. ${UNCHANGED} Regenerate the notes to try again.`,
  timeout: `Writing the notes took too long. ${UNCHANGED} Regenerate the notes to try again.`,
  empty: "There is nothing to write notes from: no words were heard.",
};

const failure = (code: string): { ok: false; failure: WriterFailure } => ({ ok: false, failure: { code, message: NOTES_FAILURES[code] ?? NOTES_FAILURES.unavailable! } });

const stamp = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s % 60).padStart(2, "0")}`;
};

/** The transcript as the writer reads it: one line per entry with the time. Too long is cut in the middle. */
export function promptText(lines: readonly NoteLine[], max = MAX_PROMPT_CHARS): string {
  const all = lines.map((l) => `[${stamp(l.start)}] ${l.text}`).join("\n");
  if (all.length <= max) return all;
  const half = Math.floor(max / 2);
  return `${all.slice(0, half)}\n[... part of the transcript left out ...]\n${all.slice(-half)}`;
}

const SYSTEM = `You write notes for a transcript. Answer with JSON only: {"title": short title of at most 8 words, "summary": exactly two sentences, "chapters": [{"start": seconds from the start, "title": short title}]}. Use the language of the transcript. Write only what the transcript says.`;

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The writer's JSON, tolerating a code fence around it. Chapters are put in time order and given the words said inside them. */
export function parseNotes(text: string, lines: readonly NoteLine[]): Notes | undefined {
  const body = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let doc: { title?: unknown; summary?: unknown; chapters?: unknown };
  try {
    doc = JSON.parse(body);
  } catch {
    return undefined;
  }
  const summary = clean(doc?.summary, 1200);
  const title = clean(doc?.title, 120);
  if (!summary || !title) return undefined;
  const raw = (Array.isArray(doc.chapters) ? doc.chapters : []).flatMap((c: { start?: unknown; title?: unknown } | null) => {
    const t = clean(c?.title, 120);
    return t && typeof c?.start === "number" && Number.isFinite(c.start) && c.start >= 0 ? [{ start: c.start, title: t }] : [];
  });
  raw.sort((a, b) => a.start - b.start);
  // A chapter that starts after the last word has nothing to copy or show.
  return { title, summary, chapters: chapterText(lines, raw).filter((c) => c.text.trim()) };
}

/** The words said inside each chapter: from its start to the next chapter's start (the last runs to the end). */
export function chapterText(lines: readonly NoteLine[], chapters: readonly { start: number; title: string }[]): Notes["chapters"] {
  return chapters.map((c, i) => {
    const end = chapters[i + 1]?.start ?? Infinity;
    return {
      ...c,
      text: lines
        .filter((l) => l.start >= c.start && l.start < end)
        .map((l) => l.text)
        .join(" "),
    };
  });
}

/** The notes pass: the summary, the title and the chapters, written once from the transcript. Every failure is a result with a message, never a throw. */
export async function writeNotes(deps: NotesDeps, lines: readonly NoteLine[], signal?: AbortSignal): Promise<SummariseResult> {
  if (!lines.some((l) => l.text.trim())) return failure("empty");
  const own = new AbortController();
  const stop = () => own.abort();
  if (signal?.aborted) stop();
  signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(() => own.abort(), deps.timeoutMs ?? 60_000);
  let r: CompleteResult;
  try {
    r = await deps.complete(SYSTEM, promptText(lines), own.signal);
  } catch {
    r = { ok: false, code: own.signal.aborted ? "offline" : "unavailable" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
  if (own.signal.aborted && !r.ok) return failure("timeout");
  if (!r.ok) return failure(r.code);
  const notes = parseNotes(r.text, lines);
  return notes ? { ok: true, notes, writer: deps.writer } : failure("unreadable");
}
