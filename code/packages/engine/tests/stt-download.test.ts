import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { downloadModel } from "../src/stt/download";

// "abcdefghij" repeated 100 times.
const BODY = Buffer.from("abcdefghij".repeat(100));
const file = { file: "m.bin", url: "", sha256: "c49bba59ccc72847b869b364a909a52606e91412eccdc570032df23b181fdfa9", bytes: 1000 };

let server: Server;
let base: string;
let dir: string;
let requests: { range: string | undefined }[];
let honorRange = true;
let body: Buffer = BODY;

beforeEach(async () => {
  requests = [];
  honorRange = true;
  body = BODY;
  dir = await mkdtemp(join(tmpdir(), "stt-dl-"));
  server = createServer((req, res) => {
    const range = req.headers.range;
    requests.push({ range });
    const m = honorRange ? /^bytes=(\d+)-$/.exec(range ?? "") : null;
    if (m) {
      res.writeHead(206, { "Content-Length": body.length - Number(m[1]) });
      res.end(body.subarray(Number(m[1])));
    } else {
      res.writeHead(200, { "Content-Length": body.length });
      res.end(body);
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/m.bin`;
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** A fetch that answers with the given chunks, one stream read each, and records what it was asked. */
function scripted(chunks: Buffer[], status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(
      new ReadableStream({
        start(c) {
          for (const chunk of chunks) c.enqueue(new Uint8Array(chunk));
          c.close();
        },
      }),
      { status },
    );
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("downloadModel", () => {
  it("downloads, reports progress up to 1 and leaves only the finished file", async () => {
    const seen: number[] = [];
    await downloadModel({ ...file, url: base }, join(dir, "m.bin"), { onProgress: (p) => seen.push(p) });
    expect((await readFile(join(dir, "m.bin"))).equals(BODY)).toBe(true);
    expect(await exists(join(dir, "m.bin.part"))).toBe(false);
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("resumes a partial file with a Range request and ends with the right bytes", async () => {
    await writeFile(join(dir, "m.bin.part"), BODY.subarray(0, 400));
    await downloadModel({ ...file, url: base }, join(dir, "m.bin"));
    expect(requests).toEqual([{ range: "bytes=400-" }]);
    expect((await readFile(join(dir, "m.bin"))).equals(BODY)).toBe(true);
  });

  it("starts over when the server ignores the range", async () => {
    honorRange = false;
    await writeFile(join(dir, "m.bin.part"), BODY.subarray(0, 400));
    await downloadModel({ ...file, url: base }, join(dir, "m.bin"));
    expect((await readFile(join(dir, "m.bin"))).equals(BODY)).toBe(true);
  });

  it("deletes the partial file and throws on a checksum mismatch", async () => {
    body = Buffer.from("x".repeat(1000));
    await expect(downloadModel({ ...file, url: base }, join(dir, "m.bin"))).rejects.toThrow(/did not match its check value/);
    expect(await exists(join(dir, "m.bin"))).toBe(false);
    expect(await exists(join(dir, "m.bin.part"))).toBe(false);
  });

  it("keeps the partial file when the transfer is cut short, so the next call resumes", async () => {
    body = BODY.subarray(0, 600);
    await expect(downloadModel({ ...file, url: base }, join(dir, "m.bin"))).rejects.toThrow(/incomplete/);
    expect((await stat(join(dir, "m.bin.part"))).size).toBe(600);
    body = BODY;
    await downloadModel({ ...file, url: base }, join(dir, "m.bin"));
    expect(requests.at(-1)).toEqual({ range: "bytes=600-" });
    expect((await readFile(join(dir, "m.bin"))).equals(BODY)).toBe(true);
  });

  it("does not touch the network when the finished file is already there", async () => {
    await writeFile(join(dir, "m.bin"), BODY);
    await downloadModel({ ...file, url: base }, join(dir, "m.bin"));
    expect(requests).toEqual([]);
  });

  it("rejects on an HTTP error and on abort", async () => {
    await expect(downloadModel({ ...file, url: base }, join(dir, "a.bin"), { fetch: async () => new Response("no", { status: 404 }) })).rejects.toThrow("HTTP 404");
    const ac = new AbortController();
    ac.abort(new Error("stop"));
    await expect(downloadModel({ ...file, url: base }, join(dir, "b.bin"), { signal: ac.signal })).rejects.toThrow("stop");
  });

  describe("partial files", () => {
    it("deletes a partial file larger than the catalog size and starts over without a Range header", async () => {
      await writeFile(join(dir, "m.bin.part"), Buffer.alloc(1500, 1));
      await downloadModel({ ...file, url: base }, join(dir, "m.bin"));
      expect(requests).toEqual([{ range: undefined }]);
      expect((await readFile(join(dir, "m.bin"))).equals(BODY)).toBe(true);
    });

    it("does not fetch again when the partial file already has every byte, and finishes it after the checksum", async () => {
      await writeFile(join(dir, "m.bin.part"), BODY);
      await downloadModel({ ...file, url: base }, join(dir, "m.bin"));
      expect(requests).toEqual([]);
      expect((await readFile(join(dir, "m.bin"))).equals(BODY)).toBe(true);
      expect(await exists(join(dir, "m.bin.part"))).toBe(false);
    });

    it("a complete partial file with the wrong content is deleted, not installed", async () => {
      await writeFile(join(dir, "m.bin.part"), Buffer.alloc(1000, 7));
      await expect(downloadModel({ ...file, url: base }, join(dir, "m.bin"))).rejects.toThrow(/did not match its check value/);
      expect(requests).toEqual([]);
      expect(await exists(join(dir, "m.bin.part"))).toBe(false);
    });
  });

  describe("request", () => {
    it("asks for the rest of a partial file with a Range header and passes the abort signal on", async () => {
      await writeFile(join(dir, "m.bin.part"), BODY.subarray(0, 400));
      const ac = new AbortController();
      const { fetch, calls } = scripted([BODY.subarray(400)], 206);
      await downloadModel({ ...file, url: "http://models.test/m" }, join(dir, "m.bin"), { fetch, signal: ac.signal });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe("http://models.test/m");
      expect(calls[0]!.init?.headers).toEqual({ Range: "bytes=400-" });
      expect(calls[0]!.init?.signal).toBe(ac.signal);
    });

    it("sends no Range header for a fresh download, and no signal when none was given", async () => {
      const { fetch, calls } = scripted([BODY]);
      await downloadModel({ ...file, url: "http://models.test/m" }, join(dir, "m.bin"), { fetch });
      expect(calls[0]!.init?.headers).toEqual({});
      expect(calls[0]!.init).not.toHaveProperty("signal");
    });
  });

  describe("progress", () => {
    it("reports every step of a few big chunks, and 1 for the last even when it moved less than half a percent", async () => {
      const seen: number[] = [];
      const { fetch } = scripted([BODY.subarray(0, 997), BODY.subarray(997)]);
      await downloadModel({ ...file, url: "x" }, join(dir, "m.bin"), { fetch, onProgress: (p) => seen.push(p) });
      expect(seen).toEqual([0.997, 1]);
    });

    it("counts from where a resumed download continues", async () => {
      await writeFile(join(dir, "m.bin.part"), BODY.subarray(0, 400));
      const seen: number[] = [];
      const { fetch } = scripted([BODY.subarray(400, 700), BODY.subarray(700)], 206);
      await downloadModel({ ...file, url: "x" }, join(dir, "m.bin"), { fetch, onProgress: (p) => seen.push(p) });
      expect(seen).toEqual([0.7, 1]);
    });

    it("holds back steps smaller than half a percent, and never goes past 1", async () => {
      const seen: number[] = [];
      const { fetch } = scripted(Array.from({ length: 1000 }, (_, i) => BODY.subarray(i, i + 1)));
      await downloadModel({ ...file, url: "x" }, join(dir, "m.bin"), { fetch, onProgress: (p) => seen.push(p) });
      expect(seen.length).toBeGreaterThan(100);
      expect(seen.length).toBeLessThan(250);
      for (let i = 1; i < seen.length - 1; i++) expect(seen[i]! - seen[i - 1]!).toBeGreaterThanOrEqual(0.005 - 1e-9);
      expect(seen.at(-1)).toBe(1);
      expect(Math.max(...seen)).toBe(1);
    });

    it("caps the fraction at 1 when the server sends more than the catalog says", async () => {
      const seen: number[] = [];
      const { fetch } = scripted([Buffer.alloc(500, 1), Buffer.alloc(600, 1)]);
      await expect(downloadModel({ ...file, url: "x" }, join(dir, "m.bin"), { fetch, onProgress: (p) => seen.push(p) })).rejects.toThrow(/incomplete/);
      expect(seen).toEqual([0.5, 1]);
    });

    it("reports 1 at once for a model that is already complete", async () => {
      await writeFile(join(dir, "m.bin"), BODY);
      const seen: number[] = [];
      await downloadModel({ ...file, url: base }, join(dir, "m.bin"), { onProgress: (p) => seen.push(p) });
      expect(seen).toEqual([1]);
    });
  });
});
