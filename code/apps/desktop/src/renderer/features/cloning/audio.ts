import { floatToInt16 } from "@speakkit/protocol";

/** A reference clip ready to send: 16-bit mono PCM WAV bytes, its length, and what to call it ("clip.mp3", "Recording"). */
export interface Take {
  wav: Uint8Array;
  durationMs: number;
  label: string;
}

/** Average of the channels, sample by sample. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i]! += ch[i]! / channels.length;
  return out;
}

/** The 44-byte header and the samples of a mono 16-bit PCM WAV file. Samples outside -1 to 1 are clamped. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const pcm = floatToInt16(samples);
  const out = new Uint8Array(44 + pcm.byteLength);
  const dv = new DataView(out.buffer);
  const tag = (at: number, text: string) => [...text].forEach((c, i) => dv.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  dv.setUint32(4, 36 + pcm.byteLength, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // bytes per second
  dv.setUint16(32, 2, true); // bytes per frame
  dv.setUint16(34, 16, true); // bits per sample
  tag(36, "data");
  dv.setUint32(40, pcm.byteLength, true);
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return out;
}

/** The sample rate in the header of a WAV file, or null when the bytes are not a WAV file (an MP3, a recording). */
export function wavSampleRate(bytes: Uint8Array): number | null {
  const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 28 || text(0) !== "RIFF" || text(8) !== "WAVE") return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 12; at + 8 <= bytes.length; at += 8 + dv.getUint32(at + 4, true) + (dv.getUint32(at + 4, true) & 1)) {
    if (text(at) === "fmt " && at + 16 <= bytes.length) return dv.getUint32(at + 12, true);
  }
  return null;
}

/** Root-mean-square level of a block of samples, 0 to 1. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/** What the meter shows for a level: speech sits around 0.05 to 0.3, so the scale is stretched and capped at 1. */
export const meterLevel = (level: number): number => Math.min(1, level * 4);
