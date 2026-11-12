/** Lower-case words without punctuation, so "Hello, World!" and "hello world" compare equal. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate: edits (substitutions, insertions, deletions) over the words of the reference. A reference without words has rate 0 for empty text and 1 otherwise. */
export function wordErrorRate(reference: string, heard: string): number {
  const r = words(reference);
  const h = words(heard);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const row = [i];
    for (let j = 1; j <= h.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[h.length]! / r.length;
}

/** Recall: the share of the reference's words that appear in what was heard (each heard word counts once). */
export function recall(reference: string, heard: string): number {
  const r = words(reference);
  if (r.length === 0) return 1;
  const pool = new Map<string, number>();
  for (const w of words(heard)) pool.set(w, (pool.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of r) {
    const n = pool.get(w) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(w, n - 1);
    }
  }
  return hit / r.length;
}

export interface CompareRow {
  /** The recording's file name. */
  recording: string;
  /** The model file that was run. */
  modelFile: string;
  recall: number;
  wer: number;
  /** Milliseconds from the call to the text. */
  latencyMs: number;
}

/** One line per recording and model file, then the average per model file; names both so a result can be traced to its inputs. */
export function formatReport(rows: readonly CompareRow[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = rows.map((r) => `${r.modelFile}  ${r.recording}  recall ${pct(r.recall)}  wer ${pct(r.wer)}  ${Math.round(r.latencyMs)} ms`);
  const files = [...new Set(rows.map((r) => r.modelFile))];
  for (const f of files) {
    const mine = rows.filter((r) => r.modelFile === f);
    const avg = (pick: (r: CompareRow) => number) => mine.reduce((s, r) => s + pick(r), 0) / mine.length;
    lines.push(`${f}  average of ${mine.length}  recall ${pct(avg((r) => r.recall))}  wer ${pct(avg((r) => r.wer))}  ${Math.round(avg((r) => r.latencyMs))} ms`);
  }
  return lines.join("\n");
}
