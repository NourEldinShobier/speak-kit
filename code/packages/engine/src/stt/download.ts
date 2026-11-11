import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ModelFile } from "./catalog";

export interface DownloadOptions {
  /** 0..1 of the file, reported when it moves by at least half a percent. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

const size = (p: string) =>
  stat(p).then(
    (s) => s.size,
    () => -1,
  );

async function sha256Of(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

/** True when the finished file is on disk at the catalog size (it was checksummed when it was written). */
export async function modelPresent(dest: string, f: ModelFile): Promise<boolean> {
  return (await size(dest)) === f.bytes;
}

/** Streams the file into `part`, continuing at byte `have` when the server honours the range. */
async function transfer(f: ModelFile, part: string, { have, onProgress, signal, fetch: doFetch = fetch }: DownloadOptions & { have: number }): Promise<void> {
  const res = await doFetch(f.url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, ...(signal && { signal }) });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status} for ${f.file}`);
  // 206 continues the partial file; a plain 200 means the server ignored the range, so start over.
  const resumed = res.status === 206;
  let done = resumed ? have : 0;
  let last = -1;
  const counted = Readable.fromWeb(res.body as never);
  counted.on("data", (c: Buffer) => {
    done += c.length;
    const p = Math.min(1, done / f.bytes);
    if (p - last >= 0.005 || p >= 1) onProgress?.((last = p));
  });
  await pipeline(counted, createWriteStream(part, { flags: resumed ? "a" : "w" }), ...(signal ? [{ signal }] : []));
}

/**
 * Downloads `f` to `dest` through `dest.part`, so a killed or failed download resumes with a Range request next time.
 * Resolves once the file has the catalog size and SHA-256 and sits at `dest`; a checksum mismatch deletes the partial file and throws.
 */
export async function downloadModel(f: ModelFile, dest: string, o: DownloadOptions = {}): Promise<void> {
  if (await modelPresent(dest, f)) return o.onProgress?.(1);
  await mkdir(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let have = await size(part);
  if (have > f.bytes) {
    await rm(part, { force: true });
    have = -1;
  }

  if (have !== f.bytes) await transfer(f, part, { ...o, have });

  const got = await size(part);
  if (got !== f.bytes) throw new Error(`download of ${f.file} is incomplete (${got} of ${f.bytes} bytes)`);
  if ((await sha256Of(part)) !== f.sha256) {
    await rm(part, { force: true });
    throw new Error(`checksum mismatch for ${f.file}; the partial file was deleted`);
  }
  await rename(part, dest);
}
