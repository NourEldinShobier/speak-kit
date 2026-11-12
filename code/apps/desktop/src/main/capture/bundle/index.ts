import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Frame } from "../keyframes";
import type { Word } from "../narration";

const FRAME = /^f-(\d+)\.jpg$/;

/** The files of one capture folder: frames, video segments, the microphone track, the contact sheet and the words. Writes go one after the other, in order. */
export interface Bundle {
  dir(id: string): string;
  open(id: string): Promise<void>;
  frame(id: string, atMs: number, jpeg: Uint8Array): Promise<Frame>;
  video(id: string, segment: number, chunk: Uint8Array): Promise<void>;
  audio(id: string, chunk: Int16Array): Promise<void>;
  pcm(id: string): Promise<Int16Array | undefined>;
  frames(id: string): Promise<Frame[]>;
  writeFile(id: string, name: string, data: Uint8Array | string): Promise<void>;
  readFile(id: string, name: string): Promise<Buffer | undefined>;
  words(id: string, words: readonly Word[]): Promise<void>;
  bytes(id: string): Promise<number>;
  remove(id: string): Promise<void>;
}

export const videoName = (segment: number) => (segment <= 1 ? "video.webm" : `video-${segment}.webm`);

/** Used to keep the write queue going after a failed write; the failure itself reaches the caller. */
const settle = (): void => undefined;

async function sizeOf(dir: string): Promise<number> {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? await sizeOf(p) : (await stat(p)).size;
  }
  return total;
}

/** A file's bytes, or undefined when it is not there. */
async function tryRead(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch {
    // missing file
    return undefined;
  }
}

async function listFrames(dir: string): Promise<Frame[]> {
  try {
    const names = await readdir(path.join(dir, "frames"));
    return names
      .flatMap((n) => {
        const m = FRAME.exec(n);
        return m ? [{ atMs: Number(m[1]), file: path.join("frames", n) }] : [];
      })
      .sort((a, b) => a.atMs - b.atMs);
  } catch {
    // the folder is gone: no frames
    return [];
  }
}

const sizeOrZero = (dir: string): Promise<number> =>
  sizeOf(dir).catch(() => {
    // folder removed meanwhile
    return 0;
  });

export function createBundle(root: string): Bundle {
  let chain: Promise<unknown> = Promise.resolve();
  // Writes are queued so chunks of one file land in the order they were sent.
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(settle, settle);
    return run;
  };
  const dir = (id: string) => path.join(root, id);
  const settled = async <T>(fn: () => Promise<T>): Promise<T> => {
    await chain;
    return fn();
  };
  return {
    dir,
    open: (id) => mkdir(path.join(dir(id), "frames"), { recursive: true }).then(() => undefined),
    frame: (id, atMs, jpeg) => {
      const file = path.join("frames", `f-${String(Math.max(0, Math.round(atMs))).padStart(8, "0")}.jpg`);
      return queued(async () => {
        await writeFile(path.join(dir(id), file), jpeg);
        return { atMs, file };
      });
    },
    video: (id, segment, chunk) => queued(() => appendFile(path.join(dir(id), videoName(segment)), chunk)),
    audio: (id, chunk) => queued(() => appendFile(path.join(dir(id), "audio.pcm"), new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))),
    pcm: (id) =>
      settled(async () => {
        const b = await tryRead(path.join(dir(id), "audio.pcm"));
        return b && new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 2)));
      }),
    frames: (id) => settled(() => listFrames(dir(id))),
    writeFile: (id, name, data) => queued(() => writeFile(path.join(dir(id), name), data)),
    readFile: (id, name) => settled(() => tryRead(path.join(dir(id), name))),
    words: (id, words) => queued(() => writeFile(path.join(dir(id), "words.json"), JSON.stringify(words))),
    bytes: (id) => settled(() => sizeOrZero(dir(id))),
    remove: (id) => queued(() => rm(dir(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })),
  };
}
