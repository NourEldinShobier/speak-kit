import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ExportJob, ExportRequest } from "@speakkit/protocol";
import type { ExportOptions, ExportView } from "../../shared/export";
import { ExportJobs, targetFor, type ExportServer } from "./jobs";
import { encodeMp3 } from "./mp3";
import { parseWav } from "@speakkit/engine";

/** A 16-bit mono PCM WAV of a 440 Hz tone. */
function wavBytes(seconds: number, sampleRate = 24000): Uint8Array {
  const n = seconds * sampleRate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000), 44 + i * 2);
  return buf;
}

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakkit-export-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("mp3", () => {
  it("encodes one second at 192 kbps to about 24 kB with an MPEG frame header", async () => {
    const progress: number[] = [];
    const mp3 = await encodeMp3(parseWav(wavBytes(2)), 192, (f) => progress.push(f));
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1]! & 0xe0).toBe(0xe0);
    expect(mp3.length).toBeGreaterThan(40_000);
    expect(mp3.length).toBeLessThan(56_000);
    expect(progress).toEqual([0.5, 1]);
  });
});

describe("targetFor", () => {
  it("cleans the name, detects an existing file and offers a free name beside it", async () => {
    const dir = tmp();
    expect(await targetFor(dir, 'My: "chapter"?', "mp3")).toEqual({ path: path.join(dir, "My chapter.mp3"), exists: false, alternative: path.join(dir, "My chapter.mp3") });
    writeFileSync(path.join(dir, "a.wav"), "x");
    writeFileSync(path.join(dir, "a (2).wav"), "x");
    expect(await targetFor(dir, "a", "wav")).toEqual({ path: path.join(dir, "a.wav"), exists: true, alternative: path.join(dir, "a (3).wav") });
  });
});

function fakeServer(over: Partial<ExportServer> = {}) {
  const calls: string[] = [];
  let polls = 0;
  const server: ExportServer = {
    startExport: async (req: ExportRequest) => {
      calls.push(`start ${req.sentences.length} gap=${req.gapMs}`);
      return { id: "srv1", state: "running", done: 0, total: req.sentences.length, durationMs: 0 } satisfies ExportJob;
    },
    exportStatus: async () => {
      polls++;
      return { id: "srv1", state: polls < 3 ? "running" : "done", done: polls < 3 ? 1 : 2, total: 2, durationMs: 2000 } satisfies ExportJob;
    },
    exportAudio: async () => wavBytes(2),
    cancelExport: async (id) => void calls.push(`delete ${id}`),
    ...over,
  };
  return { server, calls };
}

function jobs(server: ExportServer, mp3?: (kbps: number) => void) {
  const changes: ExportView[][] = [];
  const done: ExportView[] = [];
  const j = new ExportJobs({
    server,
    pollMs: 1,
    mp3: async ({ wav, kbps, onProgress }) => {
      mp3?.(kbps);
      onProgress(1);
      return new Uint8Array([0xff, 0xfb, wav.samples.length & 0xff]);
    },
    onChange: (v) => changes.push(v.map((x) => ({ ...x }))),
    onDone: (v) => done.push({ ...v }),
  });
  return { j, changes, done };
}
const opts = (dir: string, over: Partial<ExportOptions> = {}): ExportOptions => ({
  text: "First sentence here. Second sentence here.",
  voice: "af_heart",
  speed: 1,
  format: "wav",
  mp3Kbps: 192,
  dir,
  name: "reading",
  ...over,
});
const until = async (f: () => boolean) => {
  for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(f()).toBe(true);
};

describe("ExportJobs", () => {
  it("renders on the server, saves the WAV, reports progress and removes the server copy", async () => {
    const dir = tmp();
    const { server, calls } = fakeServer();
    const { j, changes, done } = jobs(server);
    const v = await j.start(opts(dir));
    expect(v).toMatchObject({ name: "reading.wav", stage: "rendering", total: 2 });
    await until(() => done.length === 1);
    expect(done[0]).toMatchObject({ stage: "done", progress: 1, path: path.join(dir, "reading.wav"), durationMs: 2000 });
    expect(readFileSync(path.join(dir, "reading.wav")).length).toBe(44 + 48000 * 2);
    expect(calls).toEqual(["start 2 gap=250", "delete srv1"]);
    expect(changes.some((c) => c[0]!.stage === "rendering" && c[0]!.done === 1)).toBe(true);
    expect(readdirSync(dir)).toEqual(["reading.wav"]);
  });

  it("encodes MP3 in the worker with the chosen bitrate", async () => {
    const dir = tmp();
    const seen: number[] = [];
    const { j, done } = jobs(fakeServer().server, (k) => seen.push(k));
    await j.start(opts(dir, { format: "mp3", mp3Kbps: 256 }));
    await until(() => done.length === 1);
    expect(seen).toEqual([256]);
    expect([...readFileSync(path.join(dir, "reading.mp3"))]).toEqual([0xff, 0xfb, 48000 & 0xff]);
  });

  it("refuses an existing file until the user chooses; Keep both writes beside it, Replace overwrites", async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "reading.wav"), "old");
    const { j, done } = jobs(fakeServer().server);
    await expect(j.start(opts(dir))).rejects.toThrow("A file with that name already exists.");
    await j.start(opts(dir, { conflict: "keep-both" }));
    await until(() => done.length === 1);
    expect(done[0]!.path).toBe(path.join(dir, "reading (2).wav"));
    await j.start(opts(dir, { conflict: "replace" }));
    await until(() => done.length === 2);
    expect(readFileSync(path.join(dir, "reading.wav")).length).toBeGreaterThan(3);
  });

  it("cancel stops the job, leaves no partial file and deletes the server copy", async () => {
    const dir = tmp();
    const { server, calls } = fakeServer({ exportStatus: async () => ({ id: "srv1", state: "running", done: 1, total: 2, durationMs: 0 }) });
    const { j } = jobs(server);
    const v = await j.start(opts(dir));
    await until(() => j.views[0]!.done === 1);
    await j.cancel(v.id);
    await until(() => j.views[0]!.stage === "cancelled");
    expect(readdirSync(dir)).toEqual([]);
    expect(calls).toContain("delete srv1");
    expect(j.views.filter((v) => v.stage === "rendering").length).toBe(0);
  });

  it("a server failure becomes an error view with the server's message", async () => {
    const dir = tmp();
    const { j } = jobs(fakeServer({ startExport: async () => Promise.reject(new Error("engine-not-ready")) }).server);
    await j.start(opts(dir));
    await until(() => j.views[0]!.stage === "error");
    expect(j.views[0]!.error).toBe("engine-not-ready");
  });

  it("a write error ends in an error view, frees the server's copy and leaves no partial file", async () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "blocked"), "a file where the export folder should be");
    const { server, calls } = fakeServer();
    const { j } = jobs(server);
    await j.start(opts(path.join(dir, "blocked", "exports")));
    await until(() => j.views[0]!.stage === "error");
    expect(j.views[0]!.error).toMatch(/ENOTDIR|EEXIST|not a directory/i);
    await until(() => calls.includes("delete srv1"));
    expect(readdirSync(dir)).toEqual(["blocked"]);
  });

  it("text with nothing to say is rejected before any request", async () => {
    const { j } = jobs(fakeServer().server);
    await expect(j.start(opts(tmp(), { text: " ... " }))).rejects.toThrow("There is no text to export.");
  });
});
