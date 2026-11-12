import { describe, expect, it } from "vite-plus/test";
import type { DictationModelId } from "../../shared/dictation/settings";
import { DownloadError } from "@speakkit/engine";
import { ModelManager, supportsLanguage } from "./models";
import type { Stt } from "./stt";
import { FakeStt } from "./stt-fake";

const TURBO: DictationModelId = "large-v3-turbo-q5_0";
const PARAKEET: DictationModelId = "parakeet-tdt-0.6b-v3-q4_0";

function setup() {
  const stt = new FakeStt();
  const state = { selected: TURBO, changes: 0 };
  const m = new ModelManager({ stt, selected: () => state.selected, select: (id) => (state.selected = id), changed: () => void state.changes++ });
  return { stt, state, m };
}

describe("model manager", () => {
  it("knows which models are on disk", async () => {
    const { stt, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    await m.refresh();
    expect([m.isInstalled(TURBO), m.isInstalled(PARAKEET)]).toEqual([true, false]);
    expect(m.installed).toBe(true);
  });

  it("lists both models with the selected one marked", async () => {
    const { m } = setup();
    await m.refresh();
    expect(m.views().map((v) => [v.name, v.selected, v.installed])).toEqual([
      ["Whisper Large v3 Turbo", true, true],
      ["Parakeet v3", false, true],
    ]);
  });

  it("warms the selected model in the background and is ready afterwards", async () => {
    const { stt, m } = setup();
    await m.refresh();
    expect(m.ready).toBe(false);
    m.warm();
    await until(() => m.ready);
    expect(stt.status().state).toBe("ready");
  });

  it("does not warm a model that is not on disk", async () => {
    const { stt, m } = setup();
    await stt.setInstalled(TURBO, false);
    await m.refresh();
    m.warm();
    expect(stt.status().state).toBe("unloaded");
  });

  it("downloads, shows progress while it runs, then selects and loads the model", async () => {
    const { stt, state, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    await m.refresh();
    const done = m.download(PARAKEET);
    await until(() => m.busy);
    expect(m.views().find((v) => v.id === PARAKEET)?.progress).toMatchObject({ kind: "downloading", fraction: 0.4 });
    expect(state.selected).toBe(TURBO); // the old choice stays until the new model is there
    stt.finishDownload();
    await done;
    expect(state.selected).toBe(PARAKEET);
    expect(m.isInstalled(PARAKEET)).toBe(true);
    expect(m.busy).toBe(false);
    expect(m.error).toBeUndefined();
  });

  it("ignores a second download while one runs", async () => {
    const { stt, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    const first = m.download(PARAKEET);
    await until(() => m.busy);
    await m.download(TURBO);
    stt.finishDownload();
    await first;
    expect(stt.status().state).toBe("ready");
  });

  it("a cancelled download ends quietly, leaves nothing installed and loads the model in use again", async () => {
    const { stt, state, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    await m.refresh();
    await stt.load(TURBO);
    const done = m.download(PARAKEET);
    await until(() => m.busy);
    expect(stt.status().state).toBe("downloading"); // loading the other model took the loaded one away
    await m.cancel();
    await done;
    expect(m.error).toBeUndefined();
    expect(m.isInstalled(PARAKEET)).toBe(false);
    expect(state.selected).toBe(TURBO);
    await until(() => stt.status().state === "ready");
  });

  it("a failed download shows its reason and still loads the model in use again", async () => {
    const { stt, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    await m.refresh();
    await stt.load(TURBO);
    const real = stt.load.bind(stt);
    let first = true;
    stt.load = async (id, progress) => {
      if (!first) return real(id, progress);
      first = false;
      await stt.unload();
      throw new Error("The download was cut off.");
    };
    await m.download(PARAKEET);
    await until(() => stt.status().state === "ready");
    expect(m.error).toBe("The download was cut off.");
  });

  it("does not load a model again after dictation was switched off during a download", async () => {
    const { stt, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    await m.refresh();
    await stt.load(TURBO);
    const done = m.download(PARAKEET);
    await until(() => m.busy);
    await m.unload();
    await done;
    await new Promise((r) => setTimeout(r, 20));
    expect(stt.status().state).toBe("unloaded");
  });

  it("shows the engine's reason when the model cannot be loaded, and clears it when a later load works", async () => {
    const { stt, m } = setup();
    await m.refresh();
    stt.say({ loadError: "the whisper addon crashed" });
    m.warm();
    await until(() => m.error !== undefined);
    expect(m.error).toBe("the whisper addon crashed");
    m.warm();
    await until(() => m.error === undefined);
    expect(m.ready).toBe(true);
  });

  it("report puts a reason on the page", () => {
    const { state, m } = setup();
    m.report("could not load");
    expect(m.error).toBe("could not load");
    expect(state.changes).toBe(1);
  });

  it("cancel does nothing to a model that is loaded and idle", async () => {
    const { stt, m } = setup();
    await stt.load(TURBO);
    await m.cancel();
    expect(stt.status().state).toBe("ready");
  });

  it("reports why a download failed", async () => {
    const { stt, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    stt.load = async () => {
      throw new Error("The download was cut off.");
    };
    await m.download(PARAKEET);
    expect(m.error).toBe("The download was cut off.");
    expect(m.busy).toBe(false);
  });

  it("switches to an installed model by unloading the old one, and refuses one that is not on disk", async () => {
    const { stt, state, m } = setup();
    await m.refresh();
    await stt.load(TURBO);
    expect(await m.switchTo(PARAKEET)).toBe(true);
    expect(state.selected).toBe(PARAKEET);
    await until(() => stt.status().state === "ready");
    await stt.setInstalled(TURBO, false);
    await m.refresh();
    expect(await m.switchTo(TURBO)).toBe(false);
    expect(state.selected).toBe(PARAKEET);
  });

  it("unload frees the model", async () => {
    const { stt, m } = setup();
    await stt.load(TURBO);
    await m.unload();
    expect(stt.status().state).toBe("unloaded");
  });
});

describe("languages", () => {
  it("Parakeet has no Arabic; Whisper has all", () => {
    expect(supportsLanguage(PARAKEET, "ar")).toBe(false);
    expect(supportsLanguage(PARAKEET, "de")).toBe(true);
    expect(supportsLanguage(TURBO, "ar")).toBe(true);
  });
});

describe("languages and unknown models", () => {
  it("Parakeet cannot detect the language, Whisper can; a model that is not in the list only handles English", () => {
    expect(supportsLanguage(PARAKEET, "auto")).toBe(false);
    expect(supportsLanguage(TURBO, "auto")).toBe(true);
    expect(supportsLanguage("custom-0123456789ab", "en")).toBe(true);
    expect(supportsLanguage("custom-0123456789ab", "de")).toBe(false);
  });
});

/** An engine whose download is scripted: it pauses on the signal like the real one and fails or finishes when the test says. */
function scripted() {
  const base = new FakeStt();
  const have = new Set<string>();
  let finish: (() => void) | undefined;
  let fail: Error | undefined;
  const starts: number[] = [];
  const stt = Object.assign(base, {
    downloaded: async (id: string) => have.has(id),
    download: (id: string, o: { signal?: AbortSignal; progress?: (f: number) => void } = {}) =>
      new Promise<void>((resolve, reject) => {
        starts.push(starts.length);
        o.progress?.(0.5);
        if (fail) return reject(fail);
        finish = () => (have.add(id), resolve());
        o.signal?.addEventListener("abort", () => reject(o.signal!.reason), { once: true });
      }),
    load: async (id: string) => {
      if (!have.has(id)) throw new Error("not downloaded");
    },
  });
  return { stt, starts, finish: () => finish?.(), failWith: (e: Error) => (fail = e) };
}

describe("hardware floor", () => {
  const blockedSetup = () => {
    const stt = new FakeStt();
    const state = { selected: TURBO as DictationModelId, changes: 0 };
    const m = new ModelManager({ stt, selected: () => state.selected, select: (id) => (state.selected = id), changed: () => void state.changes++, blocked: () => "needs AVX2" });
    return { stt, m, state };
  };
  it("loads nothing and shows the reason instead of starting the engine", async () => {
    const { stt, m } = blockedSetup();
    await m.refresh();
    m.warm();
    expect(stt.status().state).toBe("unloaded");
    expect(m.error).toBe("needs AVX2");
  });
  it("downloads nothing either", async () => {
    const { stt, m } = blockedSetup();
    await stt.setInstalled(PARAKEET, false);
    await m.refresh();
    await m.download(PARAKEET);
    expect(m.busy).toBe(false);
    expect(m.error).toBe("needs AVX2");
    expect(stt.status().state).toBe("unloaded");
  });
});

describe("model manager downloads", () => {
  const make = (stt: Stt) => {
    const state = { selected: TURBO as DictationModelId };
    return { state, m: new ModelManager({ stt, selected: () => state.selected, select: (id) => (state.selected = id), changed: () => {} }) };
  };

  it("a second request for the model that is downloading joins it instead of starting another transfer", async () => {
    const { stt, starts, finish } = scripted();
    const { m } = make(stt);
    const a = m.download(PARAKEET);
    const b = m.download(PARAKEET);
    await until(() => starts.length > 0);
    expect(starts).toHaveLength(1);
    finish();
    await Promise.all([a, b]);
    expect(m.isInstalled(PARAKEET)).toBe(true);
  });

  it("pause keeps the download and shows it as paused; resume continues it and the model gets selected", async () => {
    const { stt, starts, finish } = scripted();
    const { m, state } = make(stt);
    const done = m.download(PARAKEET);
    await until(() => starts.length === 1);
    m.pause(PARAKEET);
    await until(() => m.views().find((v) => v.id === PARAKEET)?.progress?.kind === "paused");
    expect(m.views().find((v) => v.id === PARAKEET)!.progress).toEqual({ kind: "paused", fraction: 0.5 });
    m.resume(PARAKEET);
    await until(() => starts.length === 2);
    finish();
    await done;
    expect(state.selected).toBe(PARAKEET);
  });

  it("a failure names the host and is kept for the page; the next attempt clears it", async () => {
    const { stt, failWith } = scripted();
    const { m } = make(stt);
    failWith(new DownloadError("unreachable", "huggingface.co", 214, "Could not reach the model server huggingface.co."));
    await m.download(PARAKEET);
    expect(m.failure?.id).toBe(PARAKEET);
    expect(m.failure?.error.host).toBe("huggingface.co");
    expect(m.error).toContain("huggingface.co");
    expect(m.busy).toBe(false);
    failWith(undefined as never);
    const again = m.download(PARAKEET);
    expect(m.failure).toBeUndefined();
    m.transfers.cancel(PARAKEET);
    await again;
  });

  it("cancel stops the download without an error", async () => {
    const { stt, starts } = scripted();
    const { m } = make(stt);
    const done = m.download(PARAKEET);
    await until(() => starts.length === 1);
    await m.cancel();
    await done;
    expect(m.error).toBeUndefined();
    expect(m.failure).toBeUndefined();
    expect(m.isInstalled(PARAKEET)).toBe(false);
  });

  it("downloading another model while one downloads is ignored", async () => {
    const { stt, starts, finish } = scripted();
    const { m } = make(stt);
    const first = m.download(PARAKEET);
    await until(() => starts.length === 1);
    await m.download(TURBO);
    expect(starts).toHaveLength(1);
    finish();
    await first;
  });
});

async function until(f: () => boolean, ms = 2000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(f()).toBe(true);
}
