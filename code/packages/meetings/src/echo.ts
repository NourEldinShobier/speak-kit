import { tokenize, type Segment } from "@speakkit/transcripts";

/** Pearson correlation of two equal-length series; 0 when either is flat. */
export function correlation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    cov += x * y;
    va += x * x;
    vb += y * y;
  }
  return va === 0 || vb === 0 ? 0 : cov / Math.sqrt(va * vb);
}

export interface Window {
  from: number;
  to: number;
}

export interface EchoOptions {
  /** Headphones: the microphone cannot hear the other side, nothing is suppressed. */
  headphones?: boolean;
  /** Seconds either side of a Them line in which a You line can be its echo. */
  slackSec?: number;
  /** Windows where the loudness of the two tracks moves together (see `echoWindows`); when given, a line outside all of them is kept. */
  windows?: readonly Window[];
}

/** Windows (seconds) in which the loudness envelopes of the two tracks correlate at least `min`: the microphone heard the speakers. */
export function echoWindows(mic: readonly number[], system: readonly number[], frameSec: number, o: { windowSec?: number; min?: number } = {}): Window[] {
  const size = Math.max(2, Math.round((o.windowSec ?? 3) / frameSec));
  const out: Window[] = [];
  for (let s = 0; s + size <= Math.min(mic.length, system.length); s += size) {
    if (correlation(mic.slice(s, s + size), system.slice(s, s + size)) >= (o.min ?? 0.7)) out.push({ from: s * frameSec, to: (s + size) * frameSec });
  }
  return out;
}

const overlaps = (a: Window, b: Window, slack: number) => a.from < b.to + slack && b.from < a.to + slack;

/** Marks the words that sit in a run of at least `min` marked words. */
function runs(marked: readonly boolean[], min: number): boolean[] {
  const out = marked.map(() => false);
  for (let i = 0; i < marked.length;) {
    if (!marked[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < marked.length && marked[j]) j++;
    if (j - i >= min) for (let k = i; k < j; k++) out[k] = true;
    i = j;
  }
  return out;
}

/**
 * Removes the echo of the other side from the You track. Words of a You line that sit in a run of three or more words also said by a Them line close in
 * time are the echo and go. When the speaker talked over the other side, what is left is their own speech ("double-talk") and stays if it is three words
 * or more; a single shared word in their own sentence ("the") is never touched.
 */
export function suppressEcho(you: readonly Segment[], them: readonly Segment[], o: EchoOptions = {}): Segment[] {
  if (o.headphones) return [...you];
  const slack = o.slackSec ?? 2;
  const out: Segment[] = [];
  for (const line of you) {
    if (!tokenize(line.text).length) continue;
    const near = them.filter((t) => overlaps({ from: line.start, to: line.end }, { from: t.start, to: t.end }, slack));
    const inWindow = !o.windows || o.windows.some((w) => overlaps({ from: line.start, to: line.end }, w, 0));
    if (!near.length || !inWindow) {
      out.push(line);
      continue;
    }
    const heard = new Set(near.flatMap((t) => tokenize(t.text)));
    const raw = line.text.split(/\s+/).filter(Boolean);
    const drop = runs(
      raw.map((w) => tokenize(w).length > 0 && tokenize(w).every((t) => heard.has(t))),
      3,
    );
    const kept = raw.filter((_, i) => !drop[i]);
    if (kept.length === raw.length) out.push(line);
    else if (tokenize(kept.join(" ")).length >= 3) out.push({ ...line, text: kept.join(" ") });
  }
  return out;
}
