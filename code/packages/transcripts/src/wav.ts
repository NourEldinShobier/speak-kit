import { RATE } from "./chunker";

export class WavError extends Error {}

export interface WavInfo {
  format: number;
  channels: number;
  rate: number;
  bits: number;
  /** Byte range of the sample data. */
  dataStart: number;
  dataEnd: number;
}

/** Reads the fmt and data chunks of a RIFF/WAVE file. Throws `WavError` for anything else. */
export function wavInfo(buf: Uint8Array): WavInfo {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(...buf.subarray(o, o + 4));
  if (buf.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new WavError("not a WAVE file");
  let fmt: Omit<WavInfo, "dataStart" | "dataEnd"> | undefined;
  for (let o = 12; o + 8 <= buf.length;) {
    const size = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (tag(o) === "fmt " && body + 16 <= buf.length) {
      let format = dv.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    } else if (tag(o) === "data") {
      if (!fmt) throw new WavError("data before fmt");
      // A streamed file may claim a size past its end (or zero): take what is there.
      const end = size === 0 || body + size > buf.length ? buf.length : body + size;
      return { ...fmt, dataStart: body, dataEnd: end };
    }
    o = body + size + (size & 1);
  }
  throw new WavError("no audio data");
}

/** Mono samples in -1..1 from PCM 8/16/24/32-bit or 32/64-bit float. */
function monoSamples(buf: Uint8Array, info: WavInfo): Float32Array {
  const { format, channels, bits, dataStart, dataEnd } = info;
  const bytes = bits / 8;
  if (![1, 3].includes(format) || channels < 1 || !Number.isInteger(bytes) || bytes < 1 || bytes > 8 || (format === 3 && bytes !== 4 && bytes !== 8)) {
    throw new WavError(`unsupported WAVE format ${format}/${bits}`);
  }
  const frames = Math.floor((dataEnd - dataStart) / (bytes * channels));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = new Float32Array(frames);
  const read = (o: number): number => {
    if (format === 3) return bytes === 4 ? dv.getFloat32(o, true) : dv.getFloat64(o, true);
    if (bytes === 1) return (dv.getUint8(o) - 128) / 128;
    if (bytes === 2) return dv.getInt16(o, true) / 32768;
    if (bytes === 3) return (dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getInt8(o + 2) << 16) | 0) / 8388608;
    return dv.getInt32(o, true) / 2147483648;
  };
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(dataStart + (f * channels + c) * bytes);
    out[f] = sum / channels;
  }
  return out;
}

/** Linear resampling to 16 kHz; a lower target gets a short moving average first so the highs do not fold back. */
export function resampleTo16k(x: Float32Array, rate: number): Float32Array {
  if (rate === RATE) return x;
  const ratio = rate / RATE;
  const n = Math.floor(x.length / ratio);
  const out = new Float32Array(n);
  const w = Math.max(1, Math.round(ratio));
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    if (w > 1) {
      let s = 0;
      let c = 0;
      for (let k = i0 - (w >> 1); k <= i0 + (w >> 1); k++) if (k >= 0 && k < x.length) ((s += x[k]!), c++);
      out[i] = s / c;
    } else out[i] = x[i0]! * (1 - frac) + (x[Math.min(i0 + 1, x.length - 1)] ?? 0) * frac;
  }
  return out;
}

export const toInt16 = (x: Float32Array): Int16Array => {
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(x[i]! * 32768)));
  return out;
};

/** A WAVE file as 16 kHz mono 16-bit samples. */
export function decodeWav(buf: Uint8Array): Int16Array {
  const info = wavInfo(buf);
  return toInt16(resampleTo16k(monoSamples(buf, info), info.rate));
}

/** 16 kHz mono 16-bit WAVE file for 16-bit samples: how the audio is kept next to the words. */
export function encodeWav16k(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.length * 2);
  const dv = new DataView(out.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length * 2, true);
  tag(8, "WAVEfmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, RATE, true);
  dv.setUint32(28, RATE * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  tag(36, "data");
  dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(out.buffer, 44, pcm.length).set(pcm);
  return out;
}
