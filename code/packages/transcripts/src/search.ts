import type { Segment } from "./types";

const K1 = 1.2;
const B = 0.75;

/** Lower-case words: runs of letters and digits in any script. */
export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize("NFKC")
    .match(/[\p{L}\p{N}]+/gu) ?? [];

export interface Hit {
  id: string;
  score: number;
  /** A stretch of the transcript around the first match. */
  snippet: string;
}

interface Doc {
  text: string;
  len: number;
  tf: Map<string, number>;
}

/**
 * BM25 over transcript text, in memory. Every query word must appear (a prefix counts for the last word, so results follow the typing); results are
 * ordered by score, then newest id last for a stable order. Documents are added and replaced by id.
 */
export class SearchIndex {
  #docs = new Map<string, Doc>();
  #total = 0;

  set(id: string, text: string): void {
    this.remove(id);
    const words = tokenize(text);
    const tf = new Map<string, number>();
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    this.#docs.set(id, { text, len: words.length, tf });
    this.#total += words.length;
  }

  remove(id: string): void {
    const d = this.#docs.get(id);
    if (!d) return;
    this.#total -= d.len;
    this.#docs.delete(id);
  }

  get size(): number {
    return this.#docs.size;
  }

  search(query: string, limit = 50): Hit[] {
    const terms = tokenize(query);
    if (!terms.length || !this.#docs.size) return [];
    const avg = this.#total / this.#docs.size || 1;
    const last = terms.length - 1;
    // Document frequency per term, counting prefix matches for the last term.
    const matchTf = (d: Doc, t: string, i: number): number => {
      if (i !== last) return d.tf.get(t) ?? 0;
      let n = 0;
      for (const [w, c] of d.tf) if (w.startsWith(t)) n += c;
      return n;
    };
    const df = terms.map((t, i) => {
      let n = 0;
      for (const d of this.#docs.values()) if (matchTf(d, t, i) > 0) n++;
      return n;
    });
    const hits: Hit[] = [];
    for (const [id, d] of this.#docs) {
      let score = 0;
      let all = true;
      for (let i = 0; i < terms.length; i++) {
        const f = matchTf(d, terms[i]!, i);
        if (!f) {
          all = false;
          break;
        }
        const idf = Math.log(1 + (this.#docs.size - df[i]! + 0.5) / (df[i]! + 0.5));
        score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avg));
      }
      if (all) hits.push({ id, score, snippet: snippetAround(d.text, terms[0]!) });
    }
    return hits.sort((a, b) => b.score - a.score || (a.id < b.id ? 1 : -1)).slice(0, limit);
  }
}

/** About 120 characters around the first place `term` starts a word, cut at word edges, with ellipses where text was left out. */
export function snippetAround(text: string, term: string, span = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().search(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}`, "u"));
  if (at < 0 || flat.length <= span) return flat.slice(0, span);
  let from = Math.max(0, at - Math.floor(span / 3));
  let to = Math.min(flat.length, from + span);
  from = Math.max(0, to - span);
  const sp = flat.indexOf(" ", from);
  if (from > 0 && sp >= 0 && sp < at) from = sp + 1;
  const sp2 = flat.lastIndexOf(" ", to);
  if (to < flat.length && sp2 > at) to = sp2;
  return `${from > 0 ? "…" : ""}${flat.slice(from, to)}${to < flat.length ? "…" : ""}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Match {
  /** Index of the segment. */
  segment: number;
  /** Character range inside that segment's text. */
  from: number;
  to: number;
  /** Seconds, for jumping to the time. */
  at: number;
}

/** Every place a search text occurs inside the transcript, in reading order, ignoring case. Words are matched as typed (whole phrase, not tokens), so the highlight shows what was typed. */
export function findMatches(segments: readonly Segment[], query: string): Match[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Match[] = [];
  segments.forEach((s, segment) => {
    const hay = s.text.toLowerCase();
    for (let i = hay.indexOf(q); i >= 0; i = hay.indexOf(q, i + q.length)) out.push({ segment, from: i, to: i + q.length, at: s.start });
  });
  return out;
}
