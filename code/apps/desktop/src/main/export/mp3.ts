import { createMp3Encoder } from "wasm-media-encoders";
import type { Wav } from "@speakkit/engine";

/** About a second of audio per encoder call, so progress and cancellation have something to hook into. */
const CHUNK_SECONDS = 1;

/** Encodes mono audio to CBR MP3 with LAME (WebAssembly, no native build). Runs in a worker thread (mp3-worker.ts). */
export async function encodeMp3(wav: Wav, kbps: number, onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const enc = await createMp3Encoder();
  enc.configure({ sampleRate: wav.sampleRate, channels: 1, bitrate: kbps as 128 });
  const perChunk = wav.sampleRate * CHUNK_SECONDS;
  const parts: Uint8Array[] = [];
  for (let at = 0; at < wav.samples.length; at += perChunk) {
    const end = Math.min(at + perChunk, wav.samples.length);
    parts.push(enc.encode([wav.samples.subarray(at, end)]).slice());
    onProgress(end / wav.samples.length);
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
