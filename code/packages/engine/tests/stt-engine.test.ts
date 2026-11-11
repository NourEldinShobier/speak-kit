import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { EngineNotReadyError, WhisperStt, type EngineStatus, type SttModel } from "../src";

// Tiny stand-ins for the catalog files; the sha256 values are those of the strings "model-a", "model-b" and "vad-model".
const models: SttModel[] = [
  {
    id: "large-v3-turbo-q5_0",
    engine: "whisper",
    label: "Accurate",
    file: "a.bin",
    url: "http://models.test/a",
    sha256: "73f95cf180a19624e4be9a711fd53a90dadfffa410cc9cd2ba1999454a5b99b8",
    bytes: 7,
    languages: ["auto", "en", "de", "ar"],
  },
  {
    id: "parakeet-tdt-0.6b-v3-q4_0",
    engine: "parakeet",
    label: "Fast",
    file: "b.bin",
    url: "http://models.test/b",
    sha256: "af30308345d789145d9087a8d6e5037a089e92239bc312bcaba0099bb8e20ba7",
    bytes: 7,
    languages: ["auto", "en", "de"],
  },
];
const vad = { file: "vad.bin", url: "http://models.test/vad", sha256: "202a50fa24cad6e4931b485ae8a5d4402de22cee46354f07e31081ca9e032934", bytes: 9 };
const bodies: Record<string, string> = { "http://models.test/a": "model-a", "http://models.test/b": "model-b", "http://models.test/vad": "vad-model" };

const dirs: string[] = [];
const engines: WhisperStt[] = [];
let fetched: string[];
let failNext = false;

const fakeFetch = (async (url: string) => {
  fetched.push(url);
  if (failNext) {
    failNext = false;
    return new Response("down", { status: 503 });
  }
  return new Response(bodies[url]);
}) as typeof fetch;

async function make(opts: { dir?: string; models?: SttModel[]; fetch?: typeof fetch; gpu?: boolean } = {}) {
  const modelsDir = opts.dir ?? (await mkdtemp(join(tmpdir(), "stt-")));
  if (!opts.dir) dirs.push(modelsDir);
  const e = new WhisperStt({
    modelsDir,
    workerUrl: join(import.meta.dirname, "fake-stt-worker.mjs"),
    models: opts.models ?? models,
    vad,
    fetch: opts.fetch ?? fakeFetch,
    ...(opts.gpu !== undefined && { gpu: opts.gpu }),
  });
  engines.push(e);
  return { e, modelsDir };
}
const speech = (n = 16000) => new Int16Array(n).fill(300);

afterEach(async () => {
  fetched = [];
  failNext = false;
  await Promise.all(engines.splice(0).map((e) => e.unload()));
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
fetched = [];

describe("WhisperStt", () => {
  it("downloads, loads and reports each stage in order", async () => {
    const { e, modelsDir } = await make();
    const states: EngineStatus["state"][] = [];
    e.onStatus((s) => states.push(s.state));
    const progress: number[] = [];
    await e.load("large-v3-turbo-q5_0", (p) => progress.push(p));
    expect(states).toEqual(["downloading", "downloading", "loading", "ready"]);
    expect(progress.at(-1)).toBe(1);
    expect(e.status()).toEqual({ state: "ready", detail: "gpu" });
    expect(e.backend).toBe("gpu");
    expect((await stat(join(modelsDir, "stt", "a.bin"))).size).toBe(7);
    expect((await stat(join(modelsDir, "stt", "vad.bin"))).size).toBe(9);
    expect(await e.downloaded("large-v3-turbo-q5_0")).toBe(true);
    expect(await e.downloaded("parakeet-tdt-0.6b-v3-q4_0")).toBe(false);
  });

  it("a second load of the same model does nothing; files on disk are not downloaded again", async () => {
    const { e, modelsDir } = await make();
    await e.load("large-v3-turbo-q5_0");
    await e.load("large-v3-turbo-q5_0");
    expect(fetched).toEqual(["http://models.test/vad", "http://models.test/a"]);
    const again = (await make({ dir: modelsDir })).e;
    await again.load("large-v3-turbo-q5_0");
    expect(fetched).toHaveLength(2);
    expect(again.status().state).toBe("ready");
  });

  it("transcribes with the language and reports silence as no speech", async () => {
    const { e } = await make();
    await e.load("large-v3-turbo-q5_0");
    expect(await e.transcribe(speech(32000), "de")).toEqual({ text: "whisper:32000:de", speech: true });
    expect(await e.transcribe(new Int16Array(16000), "en")).toEqual({ text: "", speech: false });
    expect(await e.transcribe(speech(8000), "ar")).toEqual({ text: "whisper:8000:ar", speech: true });
  });

  it("rejects before a load, and a language the model cannot do", async () => {
    const { e } = await make();
    await expect(e.transcribe(speech(), "en")).rejects.toBeInstanceOf(EngineNotReadyError);
    await e.load("parakeet-tdt-0.6b-v3-q4_0");
    await expect(e.transcribe(speech(), "ar")).rejects.toThrow('Fast does not support language "ar"');
    expect((await e.transcribe(speech(), "auto")).text).toBe("parakeet:16000:auto");
  });

  it("loading another model replaces the loaded one", async () => {
    const { e } = await make();
    await e.load("large-v3-turbo-q5_0");
    await e.load("parakeet-tdt-0.6b-v3-q4_0");
    expect((await e.transcribe(speech(), "en")).text).toBe("parakeet:16000:en");
    expect(fetched).toEqual(["http://models.test/vad", "http://models.test/a", "http://models.test/b"]);
  });

  it("an aborted transcription rejects with the reason and the engine stays usable", async () => {
    const { e } = await make();
    await e.load("large-v3-turbo-q5_0");
    const ac = new AbortController();
    const hang = new Int16Array(100);
    hang[0] = 999;
    const p = e.transcribe(hang, "en", ac.signal);
    ac.abort(new Error("cancelled"));
    await expect(p).rejects.toThrow("cancelled");
    expect((await e.transcribe(speech(100), "en")).speech).toBe(true);
  });

  it("a killed worker rejects the pending job, shows unloaded, and the next load starts a new one", async () => {
    const { e } = await make();
    await e.load("large-v3-turbo-q5_0");
    const hang = new Int16Array(100);
    hang[0] = 999;
    const p = e.transcribe(hang, "en");
    p.catch(() => {});
    const pid = e.workerPid!;
    process.kill(pid);
    await expect(p).rejects.toThrow(/speech worker exited/);
    await vi.waitFor(() => expect(e.status().state).toBe("unloaded"));
    await e.load("large-v3-turbo-q5_0");
    expect(e.workerPid).not.toBe(pid);
    expect((await e.transcribe(speech(100), "en")).text).toBe("whisper:100:en");
  });

  it("a failed download is an error state, keeps nothing half done, and a retry works", async () => {
    const { e } = await make();
    failNext = true;
    await expect(e.load("large-v3-turbo-q5_0")).rejects.toThrow("HTTP 503");
    expect(e.status().state).toBe("error");
    await e.load("large-v3-turbo-q5_0");
    expect(e.status().state).toBe("ready");
  });

  it("a model the worker cannot open rejects the load with its message", async () => {
    const { e } = await make({ models: models.map((m) => (m.engine === "whisper" ? { ...m, file: "bad.bin" } : m)) });
    await expect(e.load("large-v3-turbo-q5_0")).rejects.toThrow("cannot open model");
    expect(e.status()).toMatchObject({ state: "error", detail: "cannot open model" });
    expect(e.backend).toBeUndefined();
  });

  it("unload during a download stops it and leaves the engine unloaded", async () => {
    let release!: () => void;
    const slow = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/a")) await new Promise<void>((r, rej) => ((release = r), init?.signal?.addEventListener("abort", () => rej(init.signal!.reason))));
      return new Response(bodies[url]);
    }) as typeof fetch;
    const { e } = await make({ fetch: slow });
    const loading = e.load("large-v3-turbo-q5_0");
    loading.catch(() => {});
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await e.unload();
    await expect(loading).rejects.toThrow("unloaded");
    expect(e.status().state).toBe("unloaded");
  });

  it("warm() resolves when the model is ready, and also when the load failed", async () => {
    const { e } = await make();
    await e.warm("large-v3-turbo-q5_0");
    expect(e.status().state).toBe("ready");
    failNext = true;
    const { e: f } = await make();
    await f.warm("large-v3-turbo-q5_0");
    expect(f.status().state).toBe("error");
  });

  it("gpu: false runs the worker on the cpu", async () => {
    const { e } = await make({ gpu: false });
    await e.load("large-v3-turbo-q5_0");
    expect(e.backend).toBe("cpu");
  });
});
