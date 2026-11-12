/** Lower case, accents removed, so "Café" is found by "cafe". Done once when an entry is written, not on every keystroke of a search. */
export const normalize = (text: string): string => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

const words = (text: string): string[] => normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];

/** True when `a` and `b` differ by at most one inserted, deleted or changed letter. */
function withinOne(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function score(token: string, hay: string[], hayText: string): number {
  if (hay.includes(token)) return 4;
  if (hay.some((w) => w.startsWith(token))) return 3;
  if (hayText.includes(token)) return 2;
  return token.length >= 4 && hay.some((w) => w.length >= 4 && withinOne(w, token)) ? 1 : 0;
}

/**
 * How well a search matches an entry: 0 when any word of the search is missing (every word must be found, in any order), otherwise the sum of the
 * word scores. A whole word scores highest, then a word start, then part of a word, then a word one letter off. \`aliases\` lets a vocabulary term
 * also match the other spellings the person gave it.
 */
export function rank(key: string, search: string, aliases: Readonly<Record<string, readonly string[]>> = {}): number {
  const tokens = words(search);
  if (!tokens.length) return 1;
  const hay = words(key);
  let total = 0;
  for (const token of tokens) {
    const options = [token, ...(Object.hasOwn(aliases, token) ? aliases[token]! : []).map(normalize)];
    const best = Math.max(...options.map((o) => score(o, hay, key)));
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export interface HistoryStats {
  dictations: number;
  words: number;
  listeningMs: number;
  /** Programs dictated into, most used first. */
  topApps: { app: string; count: number }[];
}

/** Totals over what History holds. No streaks, no goals: just what was done. */
export function historyStats(entries: readonly { text: string; durationMs: number; app?: string }[]): HistoryStats {
  const apps = new Map<string, number>();
  let wordCount = 0;
  let listeningMs = 0;
  for (const e of entries) {
    wordCount += e.text.match(/\S+/g)?.length ?? 0;
    listeningMs += e.durationMs;
    if (e.app) apps.set(e.app, (apps.get(e.app) ?? 0) + 1);
  }
  const topApps = [...apps]
    .map(([app, count]) => ({ app, count }))
    .sort((a, b) => b.count - a.count || a.app.localeCompare(b.app))
    .slice(0, 5);
  return { dictations: entries.length, words: wordCount, listeningMs, topApps };
}
