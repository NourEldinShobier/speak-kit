import { appendFile, mkdir, readdir, readFile, rename, unlink as fsUnlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clip } from "@speakkit/dictation";
import { ignore } from "../../shared/ignore";

/** One take on disk. `recording`: the microphone was still open when the app stopped. `pending`: the recording ended and its text was not saved yet. `cancelled`: the person cancelled it; it is kept for the undo minute only and never recovered. */
interface Manifest {
  v: 1;
  id: string;
  rate: number;
  startedAt: number;
  state: "recording" | "pending" | "cancelled";
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
  /** The recording ended normally: the take stays on disk until `finish`. A cancelled take is marked so a restart never brings it back. */
  seal(id: string, state?: "pending" | "cancelled"): Promise<void>;
  /** The take is dealt with, or was discarded: its files go. A file Windows holds open is retried, then marked so it is never recovered again. */
  finish(id: string): Promise<void>;
  /** The takes a stopped app left behind, oldest first. A take that is too short, unreadable or already tried `MAX_TRIES` times is removed; the others have their try count raised. */
  recover(): Promise<Recovered[]>;
  /** Removes every take older than `MAX_AGE_MS` or cancelled, without reading any of them. */
  sweep(): Promise<void>;
  /** Removes every take. */
  clear(): Promise<void>;
}

/** Audio left on disk is not kept longer than this, whether or not it was ever transcribed. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
      (m.state === "recording" || m.state === "pending" || m.state === "cancelled") &&
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

/** The folder of takes and how it touches the disk: every file operation of the spool, with the retries Windows needs. */
function files({ dir, sleep, unlink }: Required<Pick<Options, "dir" | "sleep" | "unlink">>) {
  const file = (name: string) => path.join(dir, name);

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

  async function writeManifest(m: Manifest): Promise<void> {
    const tmp = `${file(manifestName(m.id))}.part`;
    await writeFile(tmp, JSON.stringify(m));
    await withRetry(() => rename(tmp, file(manifestName(m.id))));
  }

  return {
    file,
    writeManifest,
    async remove(id: string): Promise<void> {
      for (const name of [pcmName(id), manifestName(id)]) {
        try {
          await withRetry(() => unlink(file(name)));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
    },
    async read(id: string): Promise<Manifest | undefined> {
      try {
        return parse(await readFile(file(manifestName(id)), "utf8"));
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Keeps the audio of the take in progress on disk as raw 16-bit samples next to a small manifest, so a quit or a crash in the middle of a recording or of
 * the transcription does not lose what was said. The manifest says whether the microphone was still open (`recording`) or the take was waiting for its
 * text (`pending`, the marker written when the recording ends). Disk errors never reach the dictation: a take that cannot be written is simply not kept.
 */
export function createSpool({ dir, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), unlink = fsUnlink }: Options): Spool {
  const fs = files({ dir, sleep, unlink });
  const queues = new Map<string, Promise<unknown>>();
  let counter = 0;
  const inOrder = (id: string, work: () => Promise<void>): Promise<void> => {
    const next = (queues.get(id) ?? Promise.resolve()).then(work, work).catch(ignore);
    queues.set(id, next);
    return next;
  };

  return {
    async begin(rate, startedAt) {
      const id = `${startedAt}-${now()}-${counter++}`;
      await inOrder(id, async () => {
        await mkdir(dir, { recursive: true });
        await writeFile(fs.file(pcmName(id)), Buffer.alloc(0));
        await fs.writeManifest({ v: 1, id, rate, startedAt, state: "recording", tries: 0 });
      });
      return id;
    },

    append: (id, pcm) => (safeId(id) && pcm.length ? inOrder(id, () => appendFile(fs.file(pcmName(id)), encode(pcm))) : Promise.resolve()),

    seal: (id, state = "pending") =>
      inOrder(id, async () => {
        const m = await fs.read(id);
        if (m) await fs.writeManifest({ ...m, state });
      }),

    finish: (id) =>
      inOrder(id, async () => {
        try {
          await fs.remove(id);
        } catch {
          // Still locked after the retries: the manifest is rewritten as tried out, so the next start deletes the take instead of transcribing it twice.
          const m = await fs.read(id);
          if (m) await fs.writeManifest({ ...m, tries: MAX_TRIES }).catch(ignore);
        }
      }),

    recover: () => scanTakes({ dir, fs, now }),
    sweep: async () => void (await scanTakes({ dir, fs, now, mode: "sweep" })),
    clear: async () => void (await scanTakes({ dir, fs, now, mode: "clear" })),
  };
}

/** The takes in the folder, oldest first; see `Spool.recover`. */
async function scanTakes(o: { dir: string; fs: ReturnType<typeof files>; now: () => number; mode?: "recover" | "sweep" | "clear" }): Promise<Recovered[]> {
  const { dir, fs, now, mode = "recover" } = o;
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
    const m = await fs.read(id);
    try {
      if (!m) {
        await fs.remove(id); // a manifest that never finished writing, or an orphaned file
        continue;
      }
      const stale = m.state === "cancelled" || now() - m.startedAt > MAX_AGE_MS;
      if (mode === "clear" || (mode === "sweep" && stale)) {
        await fs.remove(id);
        continue;
      }
      if (mode === "sweep") continue;
      const pcm = decode(await readFile(fs.file(pcmName(id))));
      if (stale || m.tries >= MAX_TRIES || (pcm.length / m.rate) * 1000 < MIN_RECOVER_MS) {
        await fs.remove(id);
        continue;
      }
      await fs.writeManifest({ ...m, tries: m.tries + 1 });
      found.push({ id, startedAt: m.startedAt, state: m.state, clip: { pcm, sampleRate: m.rate, peak: peakOf(pcm) } });
    } catch {
      // an unreadable take is left for the next start
    }
  }
  return found.sort((a, b) => a.startedAt - b.startedAt);
}
