// Spoken phrases that turn into a character, matched on word boundaries, ignoring case and accents.
// `join` says which neighbouring spaces disappear: "next" ("#" + word), "prev" (", " keeps its space after), "both", or "none".
export type Join = "next" | "prev" | "both" | "none";
export interface Phrase {
  words: string[];
  out: string;
  join: Join;
}

const FOLD: Record<string, string> = { a: "aàáâãäå", e: "eèéêë", i: "iìíîï", o: "oòóôõö", u: "uùúûü", n: "nñ", c: "cç" };
const escape = (ch: string): string => ch.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export const plain = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const wordPattern = (phrase: string): string =>
  phrase
    .split(" ")
    .map((w) => [...w].map((ch) => (FOLD[ch] ? `[${FOLD[ch]}]` : escape(ch))).join(""))
    .join("[ \\t]+");

export interface Compiled {
  re: RegExp;
  byWords: Map<string, Phrase>;
}

/** `attached` also swallows one punctuation mark the model put after the phrase ("New paragraph."). */
export function compile(table: Phrase[], attached: boolean): Compiled {
  const byWords = new Map<string, Phrase>();
  for (const p of table) for (const w of p.words) byWords.set(plain(w), p);
  const alternatives = [...byWords.keys()].sort((a, b) => b.length - a.length).map(wordPattern);
  const tail = attached ? "[.,;!?]?" : "";
  const re = new RegExp(`([ \\t]*)(?<![\\p{L}\\p{N}])(${alternatives.join("|")})(?![\\p{L}\\p{N}])${tail}([ \\t]*)`, "giu");
  return { re, byWords };
}

export function apply(text: string, { re, byWords }: Compiled): string {
  return text.replace(re, (match: string, ...groups: string[]) => {
    const [lead = "", said = "", trail = ""] = groups;
    const p = byWords.get(plain(said));
    if (!p) return match;
    if (p.join === "next") return (lead && " ") + p.out;
    if (p.join === "prev") return p.out + (trail && " ");
    return p.join === "both" ? p.out : lead + p.out + trail;
  });
}
