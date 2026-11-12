import { describe, expect, it, vi } from "vite-plus/test";
import { EngineNotReadyError } from "@speakkit/engine";
import { HUNG } from "@speakkit/transcripts";
import type { Stt, SttStatus } from "../dictation/stt";
import { chunkEngine } from "./engine";

function stt(over: Partial<Stt> & { state?: string; have?: boolean } = {}) {
  let state = over.state ?? "ready";
  const calls: [string, string][] = [];
  const s: Stt = {
    status: (): SttStatus => ({ state }),
    onStatus: () => () => {},
    downloaded: async () => over.have ?? true,
    load: async () => {},
    warm: over.warm ?? (async () => void (state = "ready")),
    transcribe: over.transcribe ?? (async (_p, lang) => (calls.push(["t", lang]), { text: "hi", speech: true })),
    unload: over.unload ?? (async () => void (state = "unloaded")),
  };
  return { s, calls, set: (x: string) => (state = x) };
}
const run = (s: Stt, model: "large-v3-turbo-q5_0" | "parakeet-tdt-0.6b-v3-q4_0" = "large-v3-turbo-q5_0", language = "en", signal = new AbortController().signal) => chunkEngine({ stt: s, model: () => model })(new Int16Array(10), language, signal);

describe("chunk engine", () => {
  it("transcribes with a ready engine", async () => {
    const f = stt();
    expect(await run(f.s)).toEqual({ ok: true, text: "hi", speech: true });
    expect(f.calls).toEqual([["t", "en"]]);
  });

  it("no model installed is engine-missing, without trying to load", async () => {
    const warm = vi.fn();
    expect(await run(stt({ state: "unloaded", have: false, warm }).s)).toEqual({ ok: false, code: "engine-missing" });
    expect(warm).not.toHaveBeenCalled();
  });

  it("a model that is downloading is engine-loading", async () => {
    expect(await run(stt({ state: "downloading" }).s)).toEqual({ ok: false, code: "engine-loading" });
  });

  it("an installed model that is not loaded is loaded first", async () => {
    const f = stt({ state: "unloaded" });
    expect(await run(f.s)).toMatchObject({ ok: true });
  });

  it("a load that ends in an error is failed; one that does not finish is engine-loading", async () => {
    const failing = stt({ state: "unloaded", warm: async () => void 0 });
    failing.set("error");
    expect(await run(failing.s)).toEqual({ ok: false, code: "failed" });
    expect(await run(stt({ state: "unloaded", warm: async () => void 0 }).s)).toEqual({ ok: false, code: "engine-loading" });
  });

  it("a language the model lacks falls back to detection", async () => {
    const f = stt();
    await run(f.s, "parakeet-tdt-0.6b-v3-q4_0", "ar");
    await run(f.s, "large-v3-turbo-q5_0", "ar");
    await run(f.s, "large-v3-turbo-q5_0", "xx");
    expect(f.calls.map((c) => c[1])).toEqual(["auto", "ar", "auto"]);
  });

  it("an engine that was unloaded meanwhile is engine-loading; other errors are failed", async () => {
    expect(await run(stt({ transcribe: async () => Promise.reject(new EngineNotReadyError("unloaded")) }).s)).toEqual({ ok: false, code: "engine-loading" });
    expect(await run(stt({ transcribe: async () => Promise.reject(new Error("crash")) }).s)).toEqual({ ok: false, code: "failed" });
  });

  it("a hung chunk restarts the engine; a plain cancel does not", async () => {
    const unload = vi.fn(async () => {});
    const warm = vi.fn(async () => {});
    const hung = new AbortController();
    hung.abort(new Error(HUNG));
    expect(await run(stt({ unload, warm, transcribe: async () => Promise.reject(new Error("x")) }).s, undefined, "en", hung.signal)).toEqual({ ok: false, code: "failed" });
    expect(unload).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledTimes(1);
    const cancelled = new AbortController();
    cancelled.abort("cancel");
    await run(stt({ unload, warm, transcribe: async () => Promise.reject(new Error("x")) }).s, undefined, "en", cancelled.signal);
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it("a failing unload after a hang is ignored", async () => {
    const hung = new AbortController();
    hung.abort(new Error(HUNG));
    const r = await run(stt({ unload: async () => Promise.reject(new Error("x")), transcribe: async () => Promise.reject(new Error("x")) }).s, undefined, "en", hung.signal);
    expect(r.ok).toBe(false);
  });
});
