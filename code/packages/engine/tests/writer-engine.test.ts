import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { LocalWriter, type WriterModel } from "../src";

// A tiny stand-in for the catalog file; the sha256 is that of the string "writer-model".
const model: WriterModel = {
  id: "w",
  name: "Writer",
  description: "",
  file: "w.gguf",
  url: "http://models.test/w",
  sha256: "e2170f47a9601d6e52b7fad8247d7823a48e28d0d57eac7707e78e7e87073a74",
  bytes: 12,
  license: { name: "Apache 2.0", url: "" },
};
const dirs: string[] = [];
const writers: LocalWriter[] = [];

async function make(opts: { present?: boolean; file?: string; gpu?: boolean } = {}) {
  const modelsDir = await mkdtemp(join(tmpdir(), "writer-"));
  dirs.push(modelsDir);
  const m = { ...model, file: opts.file ?? model.file };
  if (opts.present !== false) {
    await mkdir(join(modelsDir, "stt"), { recursive: true });
    await writeFile(join(modelsDir, "stt", m.file), "writer-model");
  }
  const log = join(modelsDir, "log.txt");
  process.env.SPEAKKIT_FAKE_LOG = log;
  const w = new LocalWriter({ modelsDir, workerUrl: join(import.meta.dirname, "fake-writer-worker.mjs"), model: m, ...(opts.gpu !== undefined && { gpu: opts.gpu }) });
  writers.push(w);
  return { w, modelsDir, log };
}
const live = () => new AbortController().signal;

afterEach(async () => {
  delete process.env.SPEAKKIT_FAKE_LOG;
  await Promise.all(writers.splice(0).map((w) => w.unload()));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("local writer", () => {
  it("answers a job after loading the model, and reports where it runs", async () => {
    const { w } = await make();
    expect(await w.downloaded()).toBe(true);
    expect(await w.complete({ system: "Tidy.", text: "hello", signal: live() })).toBe("Tidy.|HELLO");
    expect(w.status()).toEqual({ state: "ready", detail: "gpu" });
    expect(w.backend).toBe("gpu");
    expect(w.workerPid).toBeTypeOf("number");
  });

  it("runs on the CPU when the graphics card is not wanted", async () => {
    const { w, log } = await make({ gpu: false });
    await w.load();
    expect(w.backend).toBe("cpu");
    expect(await readFile(log, "utf8")).toBe("start gpu=false\n");
  });

  it("never downloads while loading: a model that is not on disk fails the job and shows as an error", async () => {
    const { w } = await make({ present: false });
    expect(await w.downloaded()).toBe(false);
    await expect(w.complete({ system: "s", text: "hello", signal: live() })).rejects.toThrow("the writer model is not downloaded");
    expect(w.status()).toEqual({ state: "error", detail: "the writer model is not downloaded" });
    expect(w.workerPid).toBeUndefined();
  });

  it("downloads the file into the models folder with progress, and then loads it", async () => {
    const { w, modelsDir } = await make({ present: false });
    const downloader = new LocalWriter({ modelsDir, workerUrl: join(import.meta.dirname, "fake-writer-worker.mjs"), model, fetch: (async () => new Response("writer-model")) as typeof fetch });
    writers.push(downloader);
    const seen: number[] = [];
    await downloader.download({ progress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(1);
    expect(await readFile(join(modelsDir, "stt", "w.gguf"), "utf8")).toBe("writer-model");
    expect(await w.downloaded()).toBe(true);
    expect(await w.complete({ system: "s", text: "ok", signal: live() })).toBe("s|OK");
  });

  it("a job started during a background load waits for it", async () => {
    const { w } = await make();
    void w.warm();
    expect(await w.complete({ system: "s", text: "hi", signal: live() })).toBe("s|HI");
  });

  it("answers jobs one after another and fails only the one the model refused", async () => {
    const { w } = await make();
    const [a, b, c] = await Promise.allSettled([
      w.complete({ system: "s", text: "one", signal: live() }),
      w.complete({ system: "s", text: "boom", signal: live() }),
      w.complete({ system: "s", text: "three", signal: live() }),
    ]);
    expect(a).toEqual({ status: "fulfilled", value: "s|ONE" });
    expect(b).toMatchObject({ status: "rejected", reason: { message: "out of memory" } });
    expect(c).toEqual({ status: "fulfilled", value: "s|THREE" });
  });

  it("stops waiting at the signal and tells the model host to stop that job", async () => {
    const { w, log } = await make();
    await w.load();
    const stop = new AbortController();
    const job = w.complete({ system: "s", text: "hang", signal: stop.signal });
    await expect.poll(() => w.busy).toBe(true); // the job is with the model host now
    stop.abort(new Error("deadline"));
    await expect(job).rejects.toThrow("deadline");
    await expect.poll(() => readFile(log, "utf8")).toContain("abort id=1");
    expect(w.busy).toBe(false);
  });

  it("answers the next job normally after a skipped one", async () => {
    const { w } = await make();
    await w.load();
    const skip = new AbortController();
    const job = w.complete({ system: "s", text: "hang", signal: skip.signal });
    await expect.poll(() => w.busy).toBe(true);
    skip.abort();
    await expect(job).rejects.toThrow();
    expect(w.busy).toBe(false);
    expect(await w.complete({ system: "s", text: "next", signal: live() })).toBe("s|NEXT");
  });

  it("rejects at once with the reason of a signal that fired before the job", async () => {
    const { w } = await make();
    const stop = new AbortController();
    stop.abort(new Error("deadline"));
    await expect(w.complete({ system: "s", text: "x", signal: stop.signal })).rejects.toThrow("deadline");
    expect(w.workerPid).toBeUndefined();
  });

  it("reports a model that cannot be loaded, and loads again on the next job", async () => {
    const { w } = await make({ file: "bad.gguf" });
    await expect(w.load()).rejects.toThrow("cannot open model");
    expect(w.status()).toEqual({ state: "error", detail: "cannot open model" });
    await expect(w.complete({ system: "s", text: "x", signal: live() })).rejects.toThrow("cannot open model");
  });

  it("unloads: the host is gone, a waiting job fails, and the next job loads it again", async () => {
    const { w } = await make();
    await w.load();
    const job = w.complete({ system: "s", text: "hang", signal: live() });
    await expect.poll(() => w.busy).toBe(true);
    const failed = expect(job).rejects.toThrow("writer unloaded");
    await w.unload();
    await failed;
    expect(w.status().state).toBe("unloaded");
    expect(w.workerPid).toBeUndefined();
    expect(await w.complete({ system: "s", text: "back", signal: live() })).toBe("s|BACK");
  });
});
