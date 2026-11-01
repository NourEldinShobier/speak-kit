export class WavError extends Error {}

export interface Wav {
  sampleRate: number;
  /** Mono mix, -1..1. */
  samples: Float32Array;
}

/** Parses RIFF/WAVE with PCM 8/16/24/32-bit or float32/64 data, any channel count (mixed down to mono). */
export function parseWav(buf: Uint8Array): Wav {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(...buf.subarray(o, o + 4));
  if (buf.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new WavError("not a WAV file");
  let fmt: { format: number; channels: number; rate: number; bits: number } | undefined;
  let data: [start: number, end: number] | undefined;
  for (let o = 12; o + 8 <= buf.length; ) {
    const size = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (tag(o) === "fmt ") {
      let format = dv.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      fmt = { format, channels: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    } else if (tag(o) === "data") {
      data = [body, Math.min(buf.length, body + size)];
      break;
    }
    o = body + size + (size & 1);
  }
  if (!fmt || !data) throw new WavError("WAV file has no audio data");
  const { format, channels, rate, bits } = fmt;
  if (channels < 1 || (format !== 1 && format !== 3)) throw new WavError("unsupported WAV encoding (use PCM or float)");
  const read: Record<string, (o: number) => number> = {
    "1/8": (o) => (buf[o]! - 128) / 128,
    "1/16": (o) => dv.getInt16(o, true) / 32768,
    "1/24": (o) => ((dv.getInt8(o + 2) << 16) | (buf[o + 1]! << 8) | buf[o]!) / 8388608,
    "1/32": (o) => dv.getInt32(o, true) / 2147483648,
    "3/32": (o) => dv.getFloat32(o, true),
    "3/64": (o) => dv.getFloat64(o, true),
  };
  const get = read[`${format}/${bits}`];
  if (!get) throw new WavError(`unsupported WAV sample size (${bits}-bit)`);
  const bytes = bits / 8;
  const frames = Math.floor((data[1] - data[0]) / (bytes * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += get(data[0] + (i * channels + c) * bytes);
    samples[i] = sum / channels;
  }
  return { sampleRate: rate, samples };
}

/** 44-byte header of a mono 16-bit PCM WAV with `dataBytes` of audio after it. */
export function wavHeader(sampleRate: number, dataBytes: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export function encodeWav(pcm: Int16Array, sampleRate: number): Buffer {
  return Buffer.concat([wavHeader(sampleRate, pcm.byteLength), Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)]);
}
