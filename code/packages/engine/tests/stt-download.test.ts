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
    await expect(downloadModel({ ...file, url: base }, join(dir, "m.bin"))).rejects.toThrow(/checksum mismatch/);
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
});
