import { SearchIndex, snippetAround, tokenize } from "@speakkit/transcripts";
import type { VocabEntry } from "./notes";

export interface Searchable {
  title: string;
  summary?: string;
  /** What was said. */
  text: string;
}

export interface MeetingHit {
  id: string;
  score: number;
  snippet: string;
}

/** Distance between two words, stopping early above `max`. */
function within(a: string, b: string, max: number): number | undefined {
  if (Math.abs(a.length - b.length) > max) return undefined;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      low = Math.min(low, cur[j]!);
    }
    if (low > max) return undefined;
    prev = cur;
  }
  return prev[b.length]! <= max ? prev[b.length] : undefined;
}

const allowed = (word: string) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

/**
 * Search over meetings. Text is lower-cased and split into words once, when a meeting is added or changed; a search runs only when the query or the set of
 * meetings changed since the last one (the same question twice costs nothing). A word that finds nothing is retried as the closest word that does exist
 * (one or two letters off, by length), and the person's vocabulary counts: searching the spelling they chose finds what the engine heard differently, and the other way round.
 */
export class MeetingSearch {
  readonly #index = new SearchIndex();
  readonly #words = new Map<string, number>();
  readonly #docWords = new Map<string, string[]>();
  #vocab: VocabEntry[] = [];
  #version = 0;
  #last: { q: string; version: number; hits: MeetingHit[] } | undefined;

  get version(): number {
    return this.#version;
  }

  /** The vocabulary changed; documents added from now on carry both spellings. */
  setVocabulary(v: readonly VocabEntry[]): void {
    this.#vocab = [...v];
    this.#version++;
  }

  set(id: string, doc: Searchable): void {
    const base = `${doc.title}\n${doc.summary ?? ""}\n${doc.text}`;
    const have = new Set(tokenize(base));
    const extra = this.#vocab.flatMap((v) => {
      const from = tokenize(v.from);
      const to = tokenize(v.to);
      return from.length && from.every((w) => have.has(w)) ? to : to.length && to.every((w) => have.has(w)) ? from : [];
    });
    this.remove(id, false);
    const full = extra.length ? `${base}\n${extra.join(" ")}` : base;
    this.#index.set(id, full);
    const words = [...new Set(tokenize(full))];
    this.#docWords.set(id, words);
    for (const w of words) this.#words.set(w, (this.#words.get(w) ?? 0) + 1);
    this.#version++;
  }

  remove(id: string, bump = true): void {
    for (const w of this.#docWords.get(id) ?? []) {
      const n = (this.#words.get(w) ?? 1) - 1;
      if (n <= 0) this.#words.delete(w);
      else this.#words.set(w, n);
    }
    this.#docWords.delete(id);
    this.#index.remove(id);
    if (bump) this.#version++;
  }

  search(query: string, limit = 50): MeetingHit[] {
    const q = query.trim();
    if (!q) return [];
    if (this.#last && this.#last.q === q && this.#last.version === this.#version) return this.#last.hits;
    let hits = this.#index.search(q, limit);
    if (!hits.length) {
      const fixed = this.#correct(q);
      if (fixed && fixed !== q) hits = this.#index.search(fixed, limit);
    }
    const out = hits.map((h) => ({ id: h.id, score: h.score, snippet: h.snippet }));
    this.#last = { q, version: this.#version, hits: out };
    return out;
  }

  #correct(query: string): string | undefined {
    const terms = tokenize(query);
    if (!terms.length) return undefined;
    const fixed = terms.map((t, i) => {
      if (this.#words.has(t) || [...this.#words.keys()].some((w) => i === terms.length - 1 && w.startsWith(t))) return t;
      const max = allowed(t);
      let best: { w: string; d: number } | undefined;
      for (const w of this.#words.keys()) {
        const d = max ? within(t, w, max) : undefined;
        if (d !== undefined && (!best || d < best.d)) best = { w, d };
      }
      return best?.w ?? t;
    });
    return fixed.join(" ");
  }
}

/** Places to highlight in a text for a query: every word of the query, ignoring case, as character ranges in order. */
export function highlightRanges(text: string, query: string): { from: number; to: number }[] {
  const terms = [...new Set(tokenize(query))].filter(Boolean);
  if (!terms.length) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
  const out: { from: number; to: number }[] = [];
  for (const m of text.matchAll(re)) {
    // A word start; extend over the rest of the word so a prefix match shows the whole word.
    const end = m.index + m[0].length;
    const rest = /^[\p{L}\p{N}]*/u.exec(text.slice(end))?.[0].length ?? 0;
    out.push({ from: m.index, to: end + rest });
  }
  return out;
}

export { snippetAround };
