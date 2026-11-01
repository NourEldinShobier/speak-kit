import { createMp3Encoder } from "wasm-media-encoders";
import type { Wav } from "./wav";

/** About a second of audio per encoder call, so progress and cancellation have something to hook into. */
const CHUNK_SECONDS = 1;

/** Encodes PCM to CBR MP3 with LAME (WebAssembly, no native build). Runs in a worker thread (mp3-worker.ts). */
export async function encodeMp3(wav: Wav, kbps: number, onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const enc = await createMp3Encoder();
  if (wav.channels !== 1 && wav.channels !== 2) throw new Error("MP3 export needs mono or stereo audio.");
  enc.configure({ sampleRate: wav.sampleRate, channels: wav.channels, bitrate: kbps as 128 });
  const perChunk = wav.sampleRate * wav.channels * CHUNK_SECONDS;
  const parts: Uint8Array[] = [];
  for (let at = 0; at < wav.pcm.length; at += perChunk) {
    const slice = wav.pcm.subarray(at, Math.min(at + perChunk, wav.pcm.length));
    const frames = slice.length / wav.channels;
    const planes = Array.from({ length: wav.channels }, () => new Float32Array(frames));
    for (let i = 0; i < frames; i++) for (let c = 0; c < wav.channels; c++) planes[c]![i] = slice[i * wav.channels + c]! / 32768;
    parts.push(enc.encode(planes).slice());
    onProgress(Math.min(1, (at + slice.length) / wav.pcm.length));
  }
  parts.push(enc.finalize().slice());
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
