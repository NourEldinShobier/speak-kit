/**
 * Streaming wire format of POST /v1/speak. Each frame:
 *   u32 little-endian header length | header (UTF-8 JSON) | payload (int16 little-endian mono PCM, only for "audio")
 */
export type FrameHeader =
  | { type: "audio"; index: number; sampleRate: number; samples: number; durationMs: number }
  | { type: "done"; count: number }
  | { type: "error"; code: "engine-not-ready" | "synthesis-failed"; message: string };

export interface Frame {
  header: FrameHeader;
  pcm?: Int16Array;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeFrame(header: FrameHeader, pcm?: Int16Array): Uint8Array {
  const h = enc.encode(JSON.stringify(header));
  const body = pcm ? new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength) : new Uint8Array(0);
  const out = new Uint8Array(4 + h.length + body.length);
  new DataView(out.buffer).setUint32(0, h.length, true);
  out.set(h, 4);
  out.set(body, 4 + h.length);
  return out;
}

/** Incremental decoder: push network chunks of any size, get complete frames back. */
export class FrameDecoder {
  private buf = new Uint8Array(0);
  push(chunk: Uint8Array): Frame[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    const frames: Frame[] = [];
    for (;;) {
      if (this.buf.length < 4) break;
      const hl = new DataView(this.buf.buffer, this.buf.byteOffset).getUint32(0, true);
      if (this.buf.length < 4 + hl) break;
      const header = JSON.parse(dec.decode(this.buf.subarray(4, 4 + hl))) as FrameHeader;
      const bytes = header.type === "audio" ? header.samples * 2 : 0;
      if (this.buf.length < 4 + hl + bytes) break;
      let pcm: Int16Array | undefined;
      if (header.type === "audio") {
        const copy = this.buf.slice(4 + hl, 4 + hl + bytes); // copy: alignment-safe
        pcm = new Int16Array(copy.buffer, 0, header.samples);
      }
      frames.push({ header, pcm });
      this.buf = this.buf.subarray(4 + hl + bytes);
    }
    return frames;
  }
}

export function floatToInt16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]!));
    o[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return o;
}
