export interface Wav {
  sampleRate: number;
  channels: number;
  /** Interleaved 16-bit samples. */
  pcm: Int16Array;
}

/** Reads a 16-bit PCM WAV file (what POST /v1/export returns). Throws a readable error for anything else. */
export function parseWav(bytes: Uint8Array): Wav {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("The server did not return a WAV file.");
  let fmt: { sampleRate: number; channels: number } | null = null;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const size = dv.getUint32(o + 4, true);
    if (tag(o) === "fmt ") {
      if (dv.getUint16(o + 8, true) !== 1 || dv.getUint16(o + 22, true) !== 16) throw new Error("Only 16-bit PCM audio can be exported.");
      fmt = { channels: dv.getUint16(o + 10, true), sampleRate: dv.getUint32(o + 12, true) };
    } else if (tag(o) === "data") {
      if (!fmt) throw new Error("The WAV file has no format chunk.");
      const start = o + 8;
      const end = Math.min(bytes.length, size === 0xffffffff || start + size > bytes.length ? bytes.length : start + size);
      const pcm = new Int16Array((end - start) >> 1);
      for (let i = 0; i < pcm.length; i++) pcm[i] = dv.getInt16(start + i * 2, true);
      return { ...fmt, pcm };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error("The WAV file has no audio.");
}
