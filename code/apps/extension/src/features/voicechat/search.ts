/**
 * Long pages: the model gets an outline and a `search_page` tool; the passages come from this keyword index (BM25) built from the page text in memory,
 * so a search costs no embedding call and only the few passages the model asks for leave the browser.
 */
const PASSAGE_CHARS = 900;
const OUTLINE_MAX_CHARS = 8000;
const OUTLINE_LINE_CHARS = 220;
const RESULTS = 3;
const K1 = 1.5;
const B = 0.75;

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
const firstSentence = (s: string) => (s.match(/^.*?[.!?。](?=\s|$)/su)?.[0] ?? s).slice(0, OUTLINE_LINE_CHARS);
const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Paragraphs (blank-line separated) joined up to about 900 characters; a longer paragraph is cut at a space. */
export function passages(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (let p of paragraphs(text)) {
    while (p.length > PASSAGE_CHARS) {
      const at = p.lastIndexOf(" ", PASSAGE_CHARS);
      flush();
      out.push(p.slice(0, at > PASSAGE_CHARS / 2 ? at : PASSAGE_CHARS));
      p = p.slice(at > PASSAGE_CHARS / 2 ? at : PASSAGE_CHARS).trim();
    }
    if (!p) continue;
    if (cur && cur.length + p.length > PASSAGE_CHARS) flush();
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  flush();
  return out;
}

/** A heading is a short paragraph without punctuation at its end, followed by a longer one. */
const isHeading = (p: string, next: string | undefined) => p.length <= 80 && !/[.!?:;,。]$/.test(p) && !!next && next.length > p.length;

/** Headings with the first sentence of their section; a page with fewer than three headings gets its paragraph openings. Evenly thinned to 8000 characters. */
export function outline(text: string): string {
  const paras = paragraphs(text);
  let lines = paras.flatMap((p, i) => (isHeading(p, paras[i + 1]) ? [`${p}: ${firstSentence(paras[i + 1]!)}`] : []));
  if (lines.length < 3) lines = paras.map((p) => p.slice(0, OUTLINE_LINE_CHARS));
  const every = Math.ceil(lines.join("\n").length / OUTLINE_MAX_CHARS) || 1;
  return lines
    .filter((_, i) => i % every === 0)
    .join("\n")
    .slice(0, OUTLINE_MAX_CHARS);
}

export class PageIndex {
  private readonly docs: { text: string; tf: Map<string, number>; len: number }[];
  private readonly df = new Map<string, number>();
  private readonly avg: number;

  constructor(text: string) {
    this.docs = passages(text).map((t) => {
      const tf = new Map<string, number>();
      const w = words(t);
      for (const x of w) tf.set(x, (tf.get(x) ?? 0) + 1);
      for (const x of tf.keys()) this.df.set(x, (this.df.get(x) ?? 0) + 1);
      return { text: t, tf, len: w.length };
    });
    this.avg = this.docs.reduce((a, d) => a + d.len, 0) / (this.docs.length || 1);
  }

  /** The best passages for a query, best first; none when no passage shares a word with it. */
  search(query: string, k = RESULTS): string[] {
    const q = [...new Set(words(query))];
    const N = this.docs.length;
    return this.docs
      .map((d, i) => {
        let s = 0;
        for (const w of q) {
          const f = d.tf.get(w);
          if (!f) continue;
          const df = this.df.get(w)!;
          s += Math.log(1 + (N - df + 0.5) / (df + 0.5)) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / this.avg)));
        }
        return { s, i };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, k)
      .map((x) => this.docs[x.i]!.text);
  }
}
