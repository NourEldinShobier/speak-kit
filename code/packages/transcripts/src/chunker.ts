export const RATE = 16_000;

export interface Chunk {
  /** Sample offsets into the audio, end exclusive. */
  from: number;
  to: number;
}

export interface ChunkOptions {
  /** Where a cut is wanted, in seconds. */
  targetSec?: number;
  /** The most a chunk may hold. */
  maxSec?: number;
  /** A cut is searched for in the last stretch before the target, this many seconds wide. */
  searchSec?: number;
}

/** Index of the quietest 100 ms frame in [from, to); the earliest of equal ones. */
function quietest(pcm: Int16Array, from: number, to: number): number {
  const frame = RATE / 10;
  let best = from;
  let bestEnergy = Infinity;
  for (let s = from; s + frame <= to; s += frame) {
    let e = 0;
    for (let i = s; i < s + frame; i += 4) e += Math.abs(pcm[i]!);
    if (e < bestEnergy) {
      bestEnergy = e;
      best = s;
    }
  }
  return best + frame / 2;
}

/**
 * Cuts the audio into chunks for the engine: about `targetSec` long, ending in the quietest moment of the stretch before the target so a word is rarely cut in half.
 * The plan depends only on the samples, so a resumed job gets the same chunks and can skip the ones already done.
 */
export function planChunks(pcm: Int16Array, { targetSec = 30, maxSec = 35, searchSec = 8 }: ChunkOptions = {}): Chunk[] {
  const out: Chunk[] = [];
  const target = Math.round(targetSec * RATE);
  const max = Math.round(maxSec * RATE);
  const search = Math.round(searchSec * RATE);
  let from = 0;
  while (from < pcm.length) {
    if (pcm.length - from <= max) {
      out.push({ from, to: pcm.length });
      break;
    }
    const to = quietest(pcm, from + target - search, from + target);
    out.push({ from, to: Math.min(Math.max(to, from + 1), from + max) });
    from = out.at(-1)!.to;
  }
  return out;
}
