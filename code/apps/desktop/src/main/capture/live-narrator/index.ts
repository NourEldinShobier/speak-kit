import { findSegments, wordsOf, type Segment, type Word } from "../narration";
import { engineOf } from "../narration/engine";
import type { Narrator } from "../recording";

const RATE = 16_000;

export interface LiveOptions {
  narrator: Narrator;
  log(line: string): void;
  /** How often the new audio is looked at. */
  everyMs?: number;
  /** Silence after a stretch before it counts as finished (more than the merge gap and padding of the stretch finder). */
  closeGapMs?: number;
  /** A stretch of speech that does not pause is cut after this long. */
  maxStretchMs?: number;
}

export interface LiveTranscriber {
  push(chunk: Int16Array): void;
  /** Transcribes what is left and gives all the words, or null when there were none. */
  finish(): Promise<Word[] | null>;
}

const joined = (parts: readonly Int16Array[], length: number): Int16Array => {
  const all = new Int16Array(length);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
};

/**
 * Speech to words while the recording goes on: a stretch of speech is sent to the model as soon as a pause shows it is finished, so the words
 * of a long capture are ready a moment after it ends instead of minutes later. A stretch that fails is skipped and logged.
 */
export function createLiveTranscriber(o: LiveOptions): LiveTranscriber {
  const everySamples = ((o.everyMs ?? 1000) * RATE) / 1000;
  const closeGapMs = o.closeGapMs ?? 1200;
  const maxStretchMs = o.maxStretchMs ?? 30_000;
  let parts: Int16Array[] = [];
  /** Samples in `parts`, and how many samples came before them. */
  let held = 0;
  let before = 0;
  let looked = 0;
  const words: Word[] = [];
  let chain: Promise<void> = Promise.resolve();

  const send = (pcm: Int16Array, seg: Segment, offsetMs: number) => {
    const at = { startMs: offsetMs + seg.startMs, endMs: offsetMs + seg.endMs };
    const from = Math.floor((seg.startMs / 1000) * RATE);
    const to = Math.ceil((seg.endMs / 1000) * RATE);
    const piece = pcm.slice(from, to);
    chain = chain.then(async () => {
      try {
        words.push(...wordsOf(await o.narrator.transcribe(piece), at));
      } catch (e) {
        o.log(`capture narration: one stretch failed (${e instanceof Error ? e.message : String(e)})`);
      }
    });
  };

  const look = (final: boolean) => {
    const pcm = joined(parts, held);
    const offsetMs = (before / RATE) * 1000;
    const totalMs = (held / RATE) * 1000;
    const found = findSegments(pcm, { rate: RATE });
    let done = final ? found : found.filter((s) => s.endMs <= totalMs - closeGapMs);
    const first = found[0];
    if (!done.length && first && totalMs - first.startMs > maxStretchMs) done = [{ startMs: first.startMs, endMs: first.startMs + maxStretchMs }];
    for (const seg of done) send(pcm, seg, offsetMs);
    const upTo = final ? totalMs : (done.at(-1)?.endMs ?? 0);
    const cut = Math.min(held, Math.floor((upTo / 1000) * RATE));
    if (cut > 0) {
      parts = [pcm.slice(cut)];
      held -= cut;
      before += cut;
    }
  };

  return {
    push(chunk) {
      parts.push(chunk);
      held += chunk.length;
      if (before + held - looked < everySamples) return;
      looked = before + held;
      look(false);
    },
    async finish() {
      look(true);
      await chain;
      return words.length ? words : null;
    },
  };
}

export interface LiveSession {
  /** A recording starts: a transcriber is made when the live engine is chosen and the model is ready. */
  begin(): void;
  push(chunk: Int16Array): void;
  /** True while a recording has a transcriber, so its words come from here and not from the whole track afterwards. */
  active(): boolean;
  finish(): Promise<Word[] | null>;
  /** The recording was discarded or failed. */
  cancel(): void;
}

export function createLiveSession(d: { settings(): Parameters<typeof engineOf>[0]; narrator: Narrator; log(line: string): void }): LiveSession {
  let current: LiveTranscriber | undefined;
  return {
    begin() {
      current = engineOf(d.settings()) === "live" && d.narrator.ready() ? createLiveTranscriber({ narrator: d.narrator, log: d.log }) : undefined;
    },
    push: (chunk) => current?.push(chunk),
    active: () => !!current,
    async finish() {
      const t = current;
      current = undefined;
      return (await t?.finish()) ?? null;
    },
    cancel() {
      current = undefined;
    },
  };
}
