import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ModelFile } from "./catalog";
import { checksumFailure, DownloadError, httpFailure, incompleteFailure, toDownloadError, worthAnotherHost } from "./download-error";

export interface DownloadOptions {
  /** 0..1 of the file, reported when it moves by at least half a percent. */
  onProgress?: (fraction: number) => void;
  /** Aborting stops the transfer and keeps the partial file for a later resume. */
  signal?: AbortSignal;
  /** Injectable for tests; the app passes the browser engine's fetch so the system proxy, PAC scripts and the system certificate store apply. */
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
async function transfer(url: string, f: ModelFile, part: string, { have, onProgress, signal, fetch: doFetch = fetch }: DownloadOptions & { have: number }): Promise<void> {
  const res = await doFetch(url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, ...(signal && { signal }) });
  if (!res.ok || !res.body) throw httpFailure(res.status, url, Math.max(0, have));
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
 * Downloads `f` to `dest` through `dest.part`, so a killed, paused or failed download resumes with a Range request next time.
 * Resolves once the file has the catalog size and SHA-256 and sits at `dest`. A checksum mismatch deletes the partial file. Every other failure
 * keeps it, and is thrown as a DownloadError that names the host; when the file has other hosts they are tried in order.
 * An abort rethrows the signal's reason untouched (pause and cancel are not failures).
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

  if (have !== f.bytes) {
    const urls = [f.url, ...(f.mirrors ?? [])];
    for (const [i, url] of urls.entries()) {
      try {
        await transfer(url, f, part, { ...o, have });
        break;
      } catch (e) {
        if (o.signal?.aborted) throw e;
        const failure = toDownloadError(e, url, Math.max(0, await size(part)));
        if (i === urls.length - 1 || !worthAnotherHost(failure)) throw failure;
        have = await size(part); // the next host continues from what is on disk
      }
    }
  }

  const got = await size(part);
  if (got !== f.bytes) throw incompleteFailure(f.file, f.url, got, f.bytes);
  if ((await sha256Of(part)) !== f.sha256) {
    await rm(part, { force: true });
    throw checksumFailure(f.file, f.url);
  }
  await rename(part, dest);
}

export { DownloadError };
