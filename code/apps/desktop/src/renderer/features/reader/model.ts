import { splitSentences } from "@speakkit/player/sentences";
import type { ReadDoc } from "@speakkit/protocol";
import type { Block, Bookmark, DocMeta } from "../../../shared/library/contract";

export interface ReaderSentence {
  text: string;
  /** index into blocks */
  block: number;
  /** character span inside the block text */
  start: number;
  end: number;
}

export interface ReaderDoc {
  blocks: Block[];
  sentences: ReaderSentence[];
  /** per block: index of its first sentence (-1 when the block has none) */
  firstSentence: number[];
  totalChars: number;
}

export function buildDoc(blocks: Block[]): ReaderDoc {
  const sentences: ReaderSentence[] = [];
  const firstSentence = blocks.map((b, i) => {
    const spans = splitSentences(b.text);
    const first = spans.length ? sentences.length : -1;
    for (const s of spans) sentences.push({ ...s, block: i });
    return first;
  });
  return { blocks, sentences, firstSentence, totalChars: sentences.reduce((n, s) => n + s.text.length, 0) };
}

/** What the player is given. The tab id is the stream group the server scopes replacement to; the desktop reader is one group. */
export function toReadDoc(doc: ReaderDoc, meta: Pick<DocMeta, "id" | "title" | "origin">, startIndex: number): ReadDoc {
  return {
    docId: meta.id,
    tabId: 0,
    url: meta.origin,
    title: meta.title,
    sentences: doc.sentences.map((s) => ({ text: s.text, block: s.block })),
    startIndex: Math.max(0, Math.min(startIndex, doc.sentences.length - 1)),
    source: "page",
  };
}

/** Fraction of the text (by characters) before the start of sentence `index`. */
export function fractionAt(doc: ReaderDoc, index: number): number {
  if (!doc.totalChars) return 0;
  let n = 0;
  for (let i = 0; i < Math.min(index, doc.sentences.length); i++) n += doc.sentences[i]!.text.length;
  return n / doc.totalChars;
}

/** Sentence whose block and offset contain a click position. */
export function sentenceAt(doc: ReaderDoc, block: number, offset: number): number {
  const first = doc.firstSentence[block] ?? -1;
  if (first < 0) {
    const next = doc.firstSentence.slice(block).find((f) => f >= 0);
    return next ?? Math.max(0, doc.sentences.length - 1);
  }
  let i = first;
  while (doc.sentences[i + 1]?.block === block && doc.sentences[i + 1]!.start <= offset) i++;
  return i;
}

export interface OutlineItem {
  label: string;
  block: number;
  /** 0 for a PDF page, 1-6 for headings */
  level: number;
}

/** Headings, plus one entry per page for PDFs. */
export function outline(blocks: Block[], isPdf: boolean): OutlineItem[] {
  const out: OutlineItem[] = [];
  let page = 0;
  blocks.forEach((b, i) => {
    if (isPdf && b.page && b.page !== page) {
      page = b.page;
      out.push({ label: `Page ${page}`, block: i, level: 0 });
    }
    if (b.kind === "heading") out.push({ label: b.text, block: i, level: b.level ?? 2 });
  });
  return out;
}

const BOOKMARK_LABEL_CHARS = 60;

/** Adds a bookmark on a sentence, or removes it when it is already there. The list stays in text order. */
export function toggleBookmark(list: readonly Bookmark[], sentence: number, text: string): Bookmark[] {
  if (list.some((b) => b.sentence === sentence)) return list.filter((b) => b.sentence !== sentence);
  const label = text.replace(/\s+/g, " ").trim();
  return [...list, { sentence, label: label.length > BOOKMARK_LABEL_CHARS ? `${label.slice(0, BOOKMARK_LABEL_CHARS - 1)}…` : label }].sort((a, b) => a.sentence - b.sentence);
}

export interface Match {
  block: number;
  start: number;
  end: number;
}

export function findMatches(blocks: Block[], query: string): Match[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Match[] = [];
  blocks.forEach((b, block) => {
    const t = b.text.toLowerCase();
    for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + q.length)) out.push({ block, start: at, end: at + q.length });
  });
  return out;
}

// Word highlight: the server returns no word timings, so the sentence's heard time is spread over its words by length.

export interface WordSpan {
  start: number;
  end: number;
}

function wordSpans(text: string): WordSpan[] {
  return [...text.matchAll(/\S+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

function pauseWeight(word: string): number {
  if (/[,;:]$/.test(word)) return 2;
  return /[.!?]$/.test(word) ? 3 : 0;
}

/** The word being spoken at `fraction` (0..1) of the sentence: cumulative weight is word length plus a pause weight for punctuation. */
export function wordAt(text: string, fraction: number): WordSpan | undefined {
  const words = wordSpans(text);
  if (!words.length) return undefined;
  const weights = words.map((w) => w.end - w.start + pauseWeight(text.slice(w.start, w.end)));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const at = Math.min(Math.max(fraction, 0), 0.9999) * total;
  for (let i = 0; i < words.length; i++) {
    acc += weights[i]!;
    if (at < acc) return words[i];
  }
  return words.at(-1);
}

/** Time since the current sentence started being heard, not counting pauses. */
export class SentenceClock {
  private startedAt = 0;
  private pausedAt: number | undefined;
  private durationMs = 0;
  active = false;

  start(now: number, heardMs: number) {
    this.startedAt = now;
    this.pausedAt = undefined;
    this.durationMs = heardMs;
    this.active = true;
  }
  pause(now: number) {
    if (this.active && this.pausedAt === undefined) this.pausedAt = now;
  }
  resume(now: number) {
    if (this.pausedAt !== undefined) {
      this.startedAt += now - this.pausedAt;
      this.pausedAt = undefined;
    }
  }
  stop() {
    this.active = false;
  }
  fraction(now: number): number {
    if (!this.active || this.durationMs <= 0) return 0;
    return Math.min(1, ((this.pausedAt ?? now) - this.startedAt) / this.durationMs);
  }
}

/** Milliseconds in one sleep-timer minute. Electron specs shorten it with localStorage "speakkit.test.msPerMinute"; the lookup is compiled out of shipped builds (tests/bundle.test.ts). */
export const sleepMsPerMinute = (): number => (__TEST_CODE__ ? Number(localStorage.getItem("speakkit.test.msPerMinute")) || 60_000 : 60_000);

export class SleepTimer {
  private endsAt: number | undefined;
  start(minutes: number, now: number, msPerMinute = 60_000) {
    this.endsAt = now + minutes * msPerMinute;
  }
  cancel() {
    this.endsAt = undefined;
  }
  get active() {
    return this.endsAt !== undefined;
  }
  remainingMs(now: number) {
    return this.endsAt === undefined ? 0 : Math.max(0, this.endsAt - now);
  }
  /** True once, when the time is up; the timer then turns itself off. */
  expired(now: number): boolean {
    if (this.endsAt === undefined || now < this.endsAt) return false;
    this.endsAt = undefined;
    return true;
  }
}

interface Saved {
  sentence: number;
  fraction: number;
}

/** Saves reading progress at most every `intervalMs` while sentences change, and immediately on flush. */
export class ProgressSaver {
  private last = 0;
  private pending: Saved | undefined;
  private save: (p: Saved) => void;
  private now: () => number;
  private intervalMs: number;
  constructor(save: (p: Saved) => void, now: () => number, intervalMs = 3000) {
    this.save = save;
    this.now = now;
    this.intervalMs = intervalMs;
  }
  update(p: Saved) {
    this.pending = p;
    if (this.now() - this.last >= this.intervalMs) this.flush();
  }
  flush() {
    if (!this.pending) return;
    this.save(this.pending);
    this.pending = undefined;
    this.last = this.now();
  }
}
