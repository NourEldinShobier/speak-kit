import { DiskFullError, type Fs } from "@speakkit/transcripts";

const enc = new TextEncoder();
const bytes = (d: Uint8Array | string) => (typeof d === "string" ? enc.encode(d) : d.slice());
const k = (f: string) => f.replaceAll("\\", "/");

/** A file system in memory. `failWrites` makes that many writes in a row fail (then they work); `full` makes every write a full-disk error. */
export class MemFs implements Fs {
  files = new Map<string, Uint8Array>();
  failWrites = 0;
  /** Writes to a path matching this fail with a plain error. */
  failOn: RegExp | undefined;
  full = false;
  writeLog: string[] = [];

  async read(file: string) {
    return this.files.get(k(file))?.slice();
  }
  async write(file: string, data: Uint8Array | string) {
    if (this.full) throw new DiskFullError();
    if (this.failOn?.test(k(file))) throw new Error("EIO");
    if (this.failWrites > 0) {
      this.failWrites--;
      throw new Error("EIO");
    }
    this.writeLog.push(k(file));
    this.files.set(k(file), bytes(data));
  }
  async append(file: string, data: Uint8Array) {
    if (this.full) throw new DiskFullError();
    const old = this.files.get(k(file)) ?? new Uint8Array(0);
    const next = new Uint8Array(old.length + data.length);
    next.set(old);
    next.set(data, old.length);
    this.files.set(k(file), next);
  }
  async remove(file: string) {
    this.files.delete(k(file));
  }
  async rename(from: string, to: string) {
    const f = this.files.get(k(from));
    if (f) this.files.set(k(to), f);
    this.files.delete(k(from));
  }
  async exists(file: string) {
    return this.files.has(k(file));
  }
  text(file: string): string | undefined {
    const f = this.files.get(k(file));
    return f && new TextDecoder().decode(f);
  }
}

export function clock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => (t += ms),
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

/** `sec` seconds of a 440 Hz tone at 16 kHz, or silence when `loud` is 0. */
export function tone(sec: number, loud = 8000): Int16Array {
  const out = new Int16Array(Math.round(sec * 16000));
  if (loud) for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.sin((i / 16000) * 2 * Math.PI * 440) * loud);
  return out;
}
