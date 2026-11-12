import { appendFile, mkdir, readdir, readFile, rename, unlink as fsUnlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clip } from "@speakkit/dictation";

/** One take on disk. `recording`: the microphone was still open when the app stopped. `pending`: the recording ended and its text was not saved yet. */
interface Manifest {
  v: 1;
  id: string;
  rate: number;
  startedAt: number;
  state: "recording" | "pending";
  /** How many launches have already tried to turn this take into text. */
  tries: number;
}

export interface Recovered {
  id: string;
  clip: Clip;
  startedAt: number;
  state: Manifest["state"];
}

export interface Spool {
  /** Opens a new take; samples are added with `append`. */
  begin(rate: number, startedAt: number): Promise<string>;
  /** Adds samples (mono, -1 to 1). Calls for one take run in order. */
  append(id: string, pcm: Float32Array): Promise<void>;
  /** The recording ended normally: the take stays on disk until `finish`. */
  seal(id: string): Promise<void>;
  /** The take is dealt with, or was discarded: its files go. A file Windows holds open is retried, then marked so it is never recovered again. */
  finish(id: string): Promise<void>;
  /** The takes a stopped app left behind, oldest first. A take that is too short, unreadable or already tried `MAX_TRIES` times is removed; the others have their try count raised. */
  recover(): Promise<Recovered[]>;
}

/** A recovered take shorter than this is not worth transcribing. */
const MIN_RECOVER_MS = 400;
export const MAX_TRIES = 3;
const BUSY = new Set(["EBUSY", "EPERM", "EACCES"]);
const RETRY_MS = 50;

const pcmName = (id: string) => `${id}.pcm`;
const manifestName = (id: string) => `${id}.json`;
const safeId = (id: string) => /^[\w-]{1,64}$/.test(id);

function encode(pcm: Float32Array): Buffer {
  const out = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i]!)) * 32767), i * 2);
  return out;
}

function decode(bytes: Buffer): Float32Array {
  const n = Math.floor(bytes.length / 2); // a half sample at the end is the write that was cut off
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = bytes.readInt16LE(i * 2) / 32768;
  return out;
}

const peakOf = (pcm: Float32Array): number => pcm.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

function parse(text: string): Manifest | undefined {
  try {
    const m = JSON.parse(text) as Partial<Manifest>;
    const ok =
      m.v === 1 &&
      typeof m.id === "string" &&
      safeId(m.id) &&
      Number.isFinite(m.rate) &&
      m.rate! > 0 &&
      Number.isFinite(m.startedAt) &&
      (m.state === "recording" || m.state === "pending") &&
      Number.isInteger(m.tries);
    return ok ? (m as Manifest) : undefined;
  } catch {
    return undefined;
  }
}

interface Options {
  dir: string;
  /** Names a new take; a counter after the start time keeps two takes in one millisecond apart. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Deletes a file; replaced in tests to stand in for a file another program holds open. */
  unlink?: (file: string) => Promise<void>;
}

/**
 * Keeps the audio of the take in progress on disk as raw 16-bit samples next to a small manifest, so a quit or a crash in the middle of a recording or of
 * the transcription does not lose what was said. The manifest says whether the microphone was still open (`recording`) or the take was waiting for its
 * text (`pending`, the marker written when the recording ends). Disk errors never reach the dictation: a take that cannot be written is simply not kept.
 */
export function createSpool({ dir, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), unlink = fsUnlink }: Options): Spool {
  const queues = new Map<string, Promise<unknown>>();
  let counter = 0;
  const inOrder = (id: string, work: () => Promise<void>): Promise<void> => {
    const next = (queues.get(id) ?? Promise.resolve()).then(work, work).catch(() => undefined);
    queues.set(id, next);
    return next;
  };
  const file = (name: string) => path.join(dir, name);

  async function writeManifest(m: Manifest): Promise<void> {
    const tmp = `${file(manifestName(m.id))}.part`;
    await writeFile(tmp, JSON.stringify(m));
    await withRetry(() => rename(tmp, file(manifestName(m.id))));
  }

  /** Windows can hold a file for a moment (a virus scanner, a search indexer): a few quick retries before giving up. */
  async function withRetry<T>(op: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await op();
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (attempt >= 4 || !code || !BUSY.has(code)) throw e;
        await sleep(RETRY_MS);
      }
    }
  }

  async function remove(id: string): Promise<void> {
    for (const name of [pcmName(id), manifestName(id)]) {
      try {
        await withRetry(() => unlink(file(name)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  }

  async function read(id: string): Promise<Manifest | undefined> {
    try {
      return parse(await readFile(file(manifestName(id)), "utf8"));
    } catch {
      return undefined;
    }
  }

  return {
    async begin(rate, startedAt) {
      const id = `${startedAt}-${now()}-${counter++}`;
      await inOrder(id, async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(file(pcmName(id)), Buffer.alloc(0));
        await writeManifest({ v: 1, id, rate, startedAt, state: "recording", tries: 0 });
      });
      return id;
    },

    append: (id, pcm) => (safeId(id) && pcm.length ? inOrder(id, () => appendFile(file(pcmName(id)), encode(pcm))) : Promise.resolve()),

    seal: (id) =>
      inOrder(id, async () => {
        const m = await read(id);
        if (m) await writeManifest({ ...m, state: "pending" });
      }),

    finish: (id) =>
      inOrder(id, async () => {
        try {
          await remove(id);
        } catch {
          // Still locked after the retries: the manifest is rewritten as tried out, so the next start deletes the take instead of transcribing it twice.
          const m = await read(id);
          if (m) await writeManifest({ ...m, tries: MAX_TRIES }).catch(() => undefined);
        }
      }),

    async recover() {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return [];
      }
      const found: Recovered[] = [];
      const ids = new Set(names.filter((n) => n.endsWith(".json") || n.endsWith(".pcm")).map((n) => n.replace(/\.(json|pcm)$/, "")));
      for (const id of ids) {
        if (!safeId(id)) continue;
        const m = await read(id);
        try {
          if (!m) {
            await remove(id); // a manifest that never finished writing, or an orphaned file
            continue;
          }
          const pcm = decode(await readFile(file(pcmName(id))));
          if (m.tries >= MAX_TRIES || (pcm.length / m.rate) * 1000 < MIN_RECOVER_MS) {
            await remove(id);
            continue;
          }
          await writeManifest({ ...m, tries: m.tries + 1 });
          found.push({ id, startedAt: m.startedAt, state: m.state, clip: { pcm, sampleRate: m.rate, peak: peakOf(pcm) } });
        } catch {
          // an unreadable take is left for the next start
        }
      }
      return found.sort((a, b) => a.startedAt - b.startedAt);
    },
  };
}
