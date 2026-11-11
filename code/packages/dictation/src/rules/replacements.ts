import type { Replacement } from "../settings";

interface Hit {
  start: number;
  end: number;
  to: string;
  order: number;
}

const WORD = /[\p{L}\p{N}_]/u;
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A phrase that starts or ends with a letter must not match inside a longer word; one that ends in a symbol ("c++") has no such edge.
function pattern(from: string): RegExp {
  const before = WORD.test(from.charAt(0)) ? "(?<![\\p{L}\\p{N}_])" : "";
  const after = WORD.test(from.charAt(from.length - 1)) ? "(?![\\p{L}\\p{N}_])" : "";
  return new RegExp(`${before}${escape(from)}${after}`, "giu");
}

function hits(text: string, rules: Replacement[]): Hit[] {
  const all: Hit[] = [];
  rules.forEach((rule, order) => {
    if (!rule.from.trim()) return;
    for (const m of text.matchAll(pattern(rule.from))) all.push({ start: m.index, end: m.index + m[0].length, to: rule.to, order });
  });
  // Longest wins, then the earlier start, then the earlier rule. A hit that overlaps a kept one is dropped.
  all.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start || a.order - b.order);
  const kept: Hit[] = [];
  for (const h of all) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}

const skipSpaces = (text: string, from: number): number => {
  let i = from;
  while (text[i] === " " || text[i] === "\t") i++;
  return i;
};

const atSentenceStart = (out: string): boolean => /(^|[.!?]\s+|\n[ \t]*)$/.test(out);

/** One pass over the original text, so a replacement is never replaced again. An empty replacement deletes the phrase and closes the gap. */
export function applyReplacements(text: string, rules: Replacement[]): string {
  let out = "";
  let cursor = 0;
  let capitalNext = false;
  const add = (chunk: string): void => {
    if (!chunk) return;
    out += capitalNext ? chunk.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : chunk;
    capitalNext = false;
  };
  for (const h of hits(text, rules)) {
    add(text.slice(cursor, h.start));
    cursor = h.end;
    if (h.to) {
      add(h.to);
      continue;
    }
    cursor = skipSpaces(text, cursor);
    const next = text[cursor];
    const sentenceStart = atSentenceStart(out);
    if (next === "," && (out === "" || sentenceStart)) {
      cursor = skipSpaces(text, cursor + 1); // a comma left at the start of a sentence goes with the phrase
    } else {
      if (next === undefined || next === "\n" || ",.;:!?".includes(next)) out = out.replace(/[ \t]+$/, "");
      if (next !== undefined && ".!?".includes(next)) out = out.replace(/,$/, "");
      if (next === "," && out.endsWith(",")) cursor++;
    }
    capitalNext = sentenceStart;
  }
  add(text.slice(cursor));
  return out;
}
