import { encodeWav } from "../src";

/** Speech-like test signal: 200 Hz tone bursts of 0.6 s separated by quiet noise, `loud` bursts at -12 dBFS. */
export function clip(seconds: number, rate = 24000, o: { amp?: number; floor?: number; speechShare?: number } = {}) {
  const { amp = 0.25, floor = 0.002, speechShare = 0.7 } = o;
  const pcm = new Int16Array(Math.round(seconds * rate));
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate;
    const speaking = (t % 1) < speechShare;
    const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    pcm[i] = Math.round(((speaking ? amp * Math.sin(2 * Math.PI * 200 * t) : 0) + floor * noise) * 32767);
  }
  return encodeWav(pcm, rate);
}
