import { describe, expect, it } from "vite-plus/test";
import type { Dictation } from "@speakkit/dictation";
import * as v from "valibot";
import { DictationConfigSchema } from "../../shared/dictation/settings";
import { HistoryApi } from "./history-api";
import type { Stt } from "./stt";

const gate = () => {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
};

function rig(opts: { dictating?: () => boolean; transcribe?: () => Promise<{ text: string; speech: boolean }> } = {}) {
  const loads: string[] = [];
  const languages: string[] = [];
  const versions: unknown[] = [];
  const stt = {
    downloaded: async () => true,
    load: async (id: string) => void loads.push(id),
    transcribe: async (_pcm: unknown, language: string) => (languages.push(language), (opts.transcribe ?? (async () => ({ text: "again", speech: true })))()),
    unload: async () => {},
    warm: async () => {},
    status: () => ({ state: "ready" }),
    onStatus: () => () => {},
  } as unknown as Stt;
  const cfg = v.parse(DictationConfigSchema, {});
  const core = {
    history: {
      preservedAs: () => undefined,
      status: () => "ok",
      get: async () => ({ id: "a", app: undefined }),
      audio: async () => ({ pcm: new Float32Array(1600), sampleRate: 16_000, peak: 1 }),
      addVersion: async (_id: string, v: unknown) => void versions.push(v),
    },
  } as unknown as Dictation;
  const pushes: unknown[] = [];
  const api = new HistoryApi({
    ready: async () => {},
    core: () => core,
    audio: () => undefined,
    cfg: () => cfg,
    dictating: opts.dictating ?? (() => false),
    stt,
    files: { open: async () => null, save: async () => null },
    push: () => pushes.push(api.parts().redo),
    refreshCount: async () => {},
    warn: () => {},
    key: { test: false },
  });
  return { api, loads, versions, cfg, languages };
}

const other = (cfg: { model: string }) => (cfg.model === "parakeet-tdt-0.6b-v3-q4_0" ? "large-v3-turbo-q5_0" : "parakeet-tdt-0.6b-v3-q4_0") as "large-v3-turbo-q5_0";

describe("Transcribe again", () => {
  it("refuses while a dictation is recording or transcribing, and does not touch the engine", async () => {
    const { api, loads, versions, cfg } = rig({ dictating: () => true });
    await api.retranscribe("a", other(cfg));
    expect(api.parts().redo).toEqual({ id: "a", model: other(cfg), state: "failed", error: "busy" });
    expect(loads).toEqual([]);
    expect(versions).toEqual([]);
  });

  it("loads the other model, stores a version and puts the chosen model back", async () => {
    const { api, loads, versions, cfg } = rig();
    await api.retranscribe("a", other(cfg));
    expect(loads).toEqual([other(cfg), cfg.model]);
    expect(versions).toHaveLength(1);
    expect(api.parts().redo).toBeUndefined();
  });

  it("runs in the language chosen for this run only, and in the dictation language when none is given", async () => {
    const { api, languages, cfg } = rig();
    cfg.language = "en";
    await api.retranscribe("a", "large-v3-turbo-q5_0", "de");
    await api.retranscribe("a", "large-v3-turbo-q5_0");
    expect(languages).toEqual(["de", "en"]);
    expect(cfg.language).toBe("en");
  });

  it("stays running after a cancel until the chosen model is back, and a second run waits for it", async () => {
    const g = gate();
    const { api, loads, cfg } = rig({ transcribe: async () => (await g.wait, { text: "late", speech: true }) });
    const first = api.retranscribe("a", other(cfg));
    await new Promise((r) => setTimeout(r, 5));
    expect(api.parts().redo?.state).toBe("running");
    await api.cancelRetranscribe();
    await new Promise((r) => setTimeout(r, 5));
    expect(api.parts().redo?.state).toBe("running");
    const second = api.retranscribe("a", other(cfg));
    await new Promise((r) => setTimeout(r, 5));
    expect(loads).toEqual([other(cfg)]); // the second run has not loaded anything yet
    g.open();
    await first;
    await second;
    expect(api.parts().redo).toBeUndefined();
    expect(loads).toEqual([other(cfg), cfg.model, other(cfg), cfg.model]);
  });
});

describe("the entries the History page gets", () => {
  const entry = { id: "a", at: 5, text: "hello", raw: "um hello", durationMs: 1200, timings: { transcribeMs: 420, pausesDroppedMs: 800 }, kind: "restored" };

  function listed(extra: object = {}) {
    const cfg = v.parse(DictationConfigSchema, {});
    const core = { history: { list: async () => [{ ...entry, ...extra }], status: () => "ok", preservedAs: () => undefined } } as unknown as Dictation;
    const api = new HistoryApi({
      ready: async () => {},
      core: () => core,
      audio: () => undefined,
      cfg: () => cfg,
      dictating: () => false,
      stt: {} as Stt,
      files: { open: async () => null, save: async () => null },
      push: () => undefined,
      refreshCount: async () => {},
      warn: () => {},
      key: { test: false },
    });
    return api.list();
  }

  it("carries how long the model took and how much silence was skipped, and the recovered kind", async () => {
    expect((await listed())[0]).toMatchObject({ timings: { transcribeMs: 420, pausesDroppedMs: 800 }, kind: "restored", raw: "um hello", text: "hello" });
  });

  it("has no timings for an entry from before they were stored", async () => {
    expect((await listed({ timings: undefined }))[0]).not.toHaveProperty("timings");
  });
});
