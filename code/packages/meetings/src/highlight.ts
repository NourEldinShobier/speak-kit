import { tokenize } from "@speakkit/transcripts/pure";

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
