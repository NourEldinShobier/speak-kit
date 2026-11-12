/** Audio kept from before the key press, in keep-ready mode. */
export const PREROLL_MS = 450;
/** Recording continues at least this long after the key is released. */
export const TAIL_MIN_MS = 200;
/** A person still speaking at release gets up to this much extra time. */
export const TAIL_MAX_MS = 600;
/** A deliberate recording may run this long before it ends by itself. */
export const MAX_TAKE_MS = 30 * 60_000;
/** Longest piece handed to the speech model at once. */
export const CHUNK_MS = 30_000;
/** Peak below this over a whole take means the microphone was muted or far too quiet. */
export const QUIET_PEAK = 0.002;

export interface PrerollInput {
  /** The microphone stays open between recordings. */
  keepReady: boolean;
  /** Other audio is muted, lowered or paused while dictating. */
  ducking: boolean;
}

/** Pre-roll needs an open microphone, and it would capture the moment before other audio was silenced. */
export const prerollMs = ({ keepReady, ducking }: PrerollInput): number => (keepReady && !ducking ? PREROLL_MS : 0);

const PAD_MS: ReadonlyArray<readonly [prefix: string, ms: number]> = [["parakeet", 400]];

/** Silence to add after the speech so the model closes the last sentence; zero for models that do not need it or when the person turned it off. */
export const trailingPadMs = (model: string, enabled: boolean): number => (enabled ? (PAD_MS.find(([prefix]) => model.startsWith(prefix))?.[1] ?? 0) : 0);

export function padTail(pcm: Float32Array, sampleRate: number, ms: number): Float32Array {
  const extra = Math.round((sampleRate * ms) / 1000);
  if (extra <= 0) return pcm;
  const out = new Float32Array(pcm.length + extra);
  out.set(pcm);
  return out;
}

/**
 * Whether to stop, `elapsedMs` after the key was released. The minimum tail always runs; after it the recording continues while speech continues,
 * until the cap. A recorder that cannot tell (`speaking` undefined) stops at the minimum.
 */
export function tailDone(elapsedMs: number, speaking: boolean | undefined): boolean {
  if (elapsedMs < TAIL_MIN_MS) return false;
  return elapsedMs >= TAIL_MAX_MS || !speaking;
}

/** Splits a long take into pieces of at most `CHUNK_MS`, so no model call gets more than it can take and none is dropped. */
export function chunkPcm(pcm: Float32Array, sampleRate: number, chunkMs = CHUNK_MS): Float32Array[] {
  const size = Math.max(1, Math.round((sampleRate * chunkMs) / 1000));
  if (pcm.length <= size) return [pcm];
  const out: Float32Array[] = [];
  for (let at = 0; at < pcm.length; at += size) out.push(pcm.subarray(at, at + size));
  return out;
}
