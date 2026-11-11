import { describe, expect, it } from "vite-plus/test";
import type { DictationModelId } from "../../shared/dictation/settings";
import { ModelManager, supportsLanguage } from "./models";
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

  it("a cancelled download ends quietly and leaves nothing installed", async () => {
    const { stt, m } = setup();
    await stt.setInstalled(PARAKEET, false);
    const done = m.download(PARAKEET);
    await until(() => m.busy);
    await m.cancel();
    await done;
    expect(m.error).toBeUndefined();
    expect(m.isInstalled(PARAKEET)).toBe(false);
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

async function until(f: () => boolean, ms = 2000) {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  expect(f()).toBe(true);
}
