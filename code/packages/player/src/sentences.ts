/**
 * Splits text into sentences with their character spans, for the reader and the highlighter.
 * It does not fetch, synthesize or play anything.
 */
/** A sentence with its character span in the source text (for highlighting). */
export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

const MAX_SENTENCE = 300;
const MIN_SPLIT = 120;

const ABBR =
  /(?:\b(?:Dr|Mr|Mrs|Ms|Mx|Prof|Sr|Jr|St|Mt|vs|cf|Fig|Figs|Eq|Inc|Ltd|Co|Corp|Dept|Univ|Gen|Gov|Sen|Rep|Hon|Lt|Col|Sgt|Capt|Cmdr|Rev|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|approx|est|ca|vol|no|pp)\.|\b(?:e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|U\.N|Ph\.D|M\.D|B\.A|M\.A|et al|N\.B|a\.k\.a)\.|\b[A-Z]\.)$/;
const HAS_WORD = /[0-9A-Za-z\u00c0-\u1fff\u2c00-\ud7ff]/; // cheaper than \p{L}: Latin, Greek, Cyrillic, Arabic, Indic, CJK
/** Whether the text holds a letter or digit (stray quotes and bullets do not). */
export const hasWord = (s: string) => HAS_WORD.test(s);
// CJK, Devanagari and Arabic text ends a sentence without a following space.
const INNER_BOUNDARY = /[.!?…。！？]["'”’)\]]*\s+\S|[。！？｡।॥؟۔]./u;
const CLAUSE = /[;:](?=\s)|,(?=\s)|\s[—–-]\s|\s(?=(?:and|but|or|which|that|because|while|although|so)\s)/g;

const segmenters = new Map<string, Intl.Segmenter>();
const segmenterFor = (lang: string) => {
  let s = segmenters.get(lang);
  if (!s) {
    try {
      s = new Intl.Segmenter(lang, { granularity: "sentence" });
    } catch {
      s = new Intl.Segmenter("en", { granularity: "sentence" });
    }
    segmenters.set(lang, s);
  }
  return s;
};

/** Split a long sentence at clause boundaries so no piece exceeds `max` characters (when a boundary exists). */
function capSentence(text: string, start: number, max = MAX_SENTENCE): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let from = 0;
  while (text.length - from > max) {
    const win = text.slice(from, from + max);
    let cut = -1;
    CLAUSE.lastIndex = 0;
    for (let m = CLAUSE.exec(win); m; m = CLAUSE.exec(win)) {
      const end = m.index + (m[0].trim() ? m[0].length : 0);
      if (end >= MIN_SPLIT) cut = end;
    }
    if (cut < 0) {
      const sp = win.lastIndexOf(" ");
      cut = sp >= MIN_SPLIT ? sp : max;
    }
    out.push({ start: start + from, end: start + from + cut });
    from += cut;
    while (text[from] === " ") from++;
  }
  if (from < text.length) out.push({ start: start + from, end: start + text.length });
  return out;
}

const PARA = String.fromCharCode(0x2029); // paragraph separator: ICU always breaks sentences here

/** Trim, merge abbreviations / stray punctuation, drop empties and cap length for one block, given raw segmenter spans. */
function finish(text: string, raw: { start: number; end: number }[]): SentenceSpan[] {
  const segs: { start: number; end: number }[] = [];
  for (const r of raw) {
    const prev = segs[segs.length - 1];
    // merge: previous ended on an abbreviation, or this piece has no letters/digits (stray quote, bullet)
    if (prev && ((text.charCodeAt(prev.end - 1) === 46 && ABBR.test(text.slice(Math.max(prev.start, prev.end - 12), prev.end))) || !HAS_WORD.test(text.slice(r.start, r.end)))) prev.end = r.end;
    else segs.push({ start: r.start, end: r.end });
  }
  const out: SentenceSpan[] = [];
  for (const sp of segs) {
    const t = text.slice(sp.start, sp.end);
    if (!HAS_WORD.test(t)) continue;
    if (t.length <= MAX_SENTENCE) out.push({ text: t, start: sp.start, end: sp.end });
    else for (const c of capSentence(t, sp.start)) out.push({ text: text.slice(c.start, c.end), start: c.start, end: c.end });
  }
  return out;
}

/**
 * Sentences of every text at once. Texts with a possible inner boundary go through ONE Intl.Segmenter pass joined by
 * U+2029 (a hard sentence break): about 4x faster than one pass per block on large pages.
 */
export function splitMany(texts: string[], lang = "en"): SentenceSpan[][] {
  const need: number[] = [];
  for (let i = 0; i < texts.length; i++) if (INNER_BOUNDARY.test(texts[i]!)) need.push(i);
  const raw = new Map<number, { start: number; end: number }[]>();
  if (need.length) {
    const offs: number[] = [];
    let joined = "";
    for (const i of need) {
      offs.push(joined.length);
      joined += texts[i] + PARA;
    }
    let k = 0;
    for (const seg of segmenterFor(lang).segment(joined)) {
      while (k + 1 < need.length && seg.index >= offs[k + 1]!) k++;
      const body = seg.segment.trim();
      if (!body) continue;
      const base = offs[k]!;
      const start = seg.index - base + (seg.segment.length - seg.segment.trimStart().length);
      const list = raw.get(need[k]!) ?? [];
      list.push({ start, end: start + body.length });
      raw.set(need[k]!, list);
    }
  }
  return texts.map((t, i) => finish(t, raw.get(i) ?? [{ start: 0, end: t.length }]));
}

/** Sentences of one text as offset spans. Exported for tests. */
export const splitSentences = (text: string, lang = "en"): SentenceSpan[] => splitMany([text], lang)[0]!;
