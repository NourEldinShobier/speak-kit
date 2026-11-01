/** A sentence with its character span in the source text (for highlighting). */
export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

const MAX_SENTENCE = 300;
const MIN_SPLIT = 120;
const ABBR = /(?:\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|Mt|vs|cf|Fig|Eq|Inc|Ltd|Co|Corp|Gen|Gov|Sen|Rep|Lt|Col|Sgt|Capt|Rev|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|approx|est|ca|vol|no|pp)\.|\b(?:e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|Ph\.D|et al)\.|\b[A-Z]\.)$/;
const HAS_WORD = /[0-9A-Za-zÀ-῿Ⰰ-퟿]/;
const CLAUSE = /[;:](?=\s)|,(?=\s)|\s[—–-]\s/g;

const endsWithAbbreviation = (s: string) => {
  const t = s.trimEnd();
  return t.endsWith(".") && ABBR.test(t.slice(-12));
};

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

/** Cut an over-long sentence at the last clause boundary (or space) before MAX_SENTENCE. */
function cap(text: string, start: number): SentenceSpan[] {
  const out: SentenceSpan[] = [];
  let from = 0;
  while (text.length - from > MAX_SENTENCE) {
    const win = text.slice(from, from + MAX_SENTENCE);
    let cut = -1;
    CLAUSE.lastIndex = 0;
    for (let m = CLAUSE.exec(win); m; m = CLAUSE.exec(win)) if (m.index + m[0].length >= MIN_SPLIT) cut = m.index + (m[0].trim() ? m[0].length : 0);
    if (cut < 0) {
      const sp = win.lastIndexOf(" ");
      cut = sp >= MIN_SPLIT ? sp : MAX_SENTENCE;
    }
    out.push({ text: text.slice(from, from + cut), start: start + from, end: start + from + cut });
    from += cut;
    while (text[from] === " ") from++;
  }
  if (from < text.length) out.push({ text: text.slice(from), start: start + from, end: start + text.length });
  return out;
}

/** Sentences of one paragraph: Intl.Segmenter, abbreviations and stray punctuation merged back, long ones capped at clause boundaries. */
export function splitSentences(text: string): SentenceSpan[] {
  const segs: { start: number; end: number }[] = [];
  for (const s of segmenter.segment(text)) {
    const r = { start: s.index, end: s.index + s.segment.length };
    const prev = segs.at(-1);
    if (prev && (endsWithAbbreviation(text.slice(prev.start, prev.end)) || !HAS_WORD.test(s.segment))) prev.end = r.end;
    else segs.push(r);
  }
  const out: SentenceSpan[] = [];
  for (const sp of segs) {
    const raw = text.slice(sp.start, sp.end);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (!HAS_WORD.test(t)) continue;
    const start = sp.start + lead;
    if (t.length <= MAX_SENTENCE) out.push({ text: t, start, end: start + t.length });
    else out.push(...cap(t, start));
  }
  return out;
}
