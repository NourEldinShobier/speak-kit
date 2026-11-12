import { DiskFullError, type Fs } from "../src/fs";

const enc = new TextEncoder();
const bytes = (d: Uint8Array | string) => (typeof d === "string" ? enc.encode(d) : d.slice());

/** A file system in memory. `fullAfter` makes every write past that many succeed-writes fail with a full disk. */
const k = (f: string) => f.replaceAll("\\", "/");

export class MemFs implements Fs {
  files = new Map<string, Uint8Array>();
  writes = 0;
  fullAfter = Infinity;
  /** Paths whose write fails with a plain error. */
  broken = new Set<string>();

  async read(file: string) {
    return this.files.get(k(file))?.slice();
  }
  async write(file: string, data: Uint8Array | string) {
    if (this.broken.has(k(file))) throw new Error("EIO");
    if (this.writes >= this.fullAfter) throw new DiskFullError();
    this.writes++;
    this.files.set(k(file), bytes(data));
  }
  async append(file: string, data: Uint8Array) {
    if (this.writes >= this.fullAfter) throw new DiskFullError();
    this.writes++;
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

export const DIR = "/data/transcripts";

/** A counter-based id source and a clock that tests move by hand. */
export function ids() {
  let n = 0;
  return () => `t${++n}`;
}

export function clock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => (t += ms),
    sleep: async (ms: number) => {
      t += ms;
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

/** `sec` seconds of a 440 Hz tone, or silence when `loud` is 0. */
export function tone(sec: number, loud = 8000): Int16Array {
  const out = new Int16Array(Math.round(sec * 16000));
  if (loud) for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.sin((i / 16000) * 2 * Math.PI * 440) * loud);
  return out;
}
