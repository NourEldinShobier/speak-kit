import { CLONE_MIN_RATE } from "@speakkit/protocol";
import { encodeWav, mixToMono, wavSampleRate, type Take } from "./audio";

/** Chatterbox's own rate: a clip is sent at this rate whatever it was recorded at. */
export const CLONE_RATE = 24_000;

/** Raised when the bytes are not audio the browser can decode. */
export class UnreadableAudio extends Error {}

/**
 * Decodes a picked file or a recording (WAV, MP3, M4A, FLAC, WebM) with the Web Audio API, mixes it to mono and resamples it to 24 kHz.
 * A WAV file below 16 kHz keeps its own rate so the server's sample-rate check still sees it; an MP3 or a recording is always resampled.
 */
export async function decodeTake(bytes: Uint8Array, label: string): Promise<Take> {
  const native = wavSampleRate(bytes);
  const rate = native !== null && native < CLONE_MIN_RATE ? native : CLONE_RATE;
  // decodeAudioData resamples to the rate of its context; an offline context needs no audio device.
  const ctx = new OfflineAudioContext(1, 1, rate);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(bytes.slice().buffer);
  } catch {
    throw new UnreadableAudio(label); // decodeAudioData rejects with an EncodingError whose text names no cause worth showing
  }
  const mono = mixToMono(Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i)));
  return { wav: encodeWav(mono, audio.sampleRate), durationMs: Math.round((mono.length / audio.sampleRate) * 1000), label };
}

/** A take's samples for playback through the preview player. */
export function takeAudio(take: Take): { sampleRate: number; chunks: Int16Array[] } {
  const dv = new DataView(take.wav.buffer, take.wav.byteOffset, take.wav.byteLength);
  const pcm = new Int16Array((take.wav.byteLength - 44) / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = dv.getInt16(44 + i * 2, true);
  return { sampleRate: dv.getUint32(24, true), chunks: [pcm] };
}
