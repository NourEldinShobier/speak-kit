/** True when the last `ms` of the track is digital silence (every sample zero or one step off): the device is open but delivering nothing. */
export function digitalSilence(pcm: Int16Array, rate: number, ms: number): boolean {
  const n = Math.round((rate * ms) / 1000);
  if (n <= 0 || pcm.length < n) return false;
  for (let i = pcm.length - n; i < pcm.length; i++) if (Math.abs(pcm[i]!) > 1) return false;
  return true;
}
