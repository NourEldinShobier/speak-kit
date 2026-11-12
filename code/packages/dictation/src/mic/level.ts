/**
 * Loudness of a block, 0 to 1, for the level bars. The average of the block is removed first: a microphone with a constant offset would otherwise
 * show a pinned bar in silence. RMS with a boost, because speech sits low in the range.
 */
export function levelOf(block: Float32Array): number {
  const n = block.length;
  if (!n) return 0;
  let mean = 0;
  for (const x of block) mean += x;
  mean /= n;
  let sum = 0;
  for (const x of block) sum += (x - mean) * (x - mean);
  return Math.min(1, Math.sqrt(sum / n) * 6);
}

/** True when every sample is exactly zero: the operating system is handing over silence (muted or blocked), not a quiet room. */
export function isDigitalSilence(block: Float32Array): boolean {
  for (const x of block) if (x !== 0) return false;
  return true;
}
