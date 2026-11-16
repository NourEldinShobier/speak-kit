import { applyEnginesPatch } from "./patch";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Transfers, type Hardware } from "@speakkit/engine";
import { DictationConfigSchema } from "../../shared/dictation/settings";
import type { DictationConfig } from "../../shared/dictation/settings";
import { ModelManager } from "../dictation/models";
import { FakeStt } from "../dictation/stt-fake";
import { SpeechModels, type SpeechModelsDeps } from "./service";
import { parseEnginesConfig } from "./test-support";
import * as v from "valibot";

const TURBO = "large-v3-turbo-q5_0";
const PARAKEET = "parakeet-tdt-0.6b-v3-q4_0";
const RTX = { name: "NVIDIA RTX 3060", driver: "31.0.15.5123" };
const flush = () => new Promise((r) => setTimeout(r, 0));

let dir: string;
beforeEach(async () => void (dir = await mkdtemp(join(tmpdir(), "speech-models-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

function setup(over: Partial<SpeechModelsDeps> = {}, hw: Hardware = { platform: "win32", arch: "x64", avx2: true, cores: 8, memoryGb: 16, gpu: RTX }) {
  const fake = new FakeStt();
  const stt = Object.assign(fake, { backend: "gpu" as "gpu" | "cpu" | undefined, workerPid: 4242 as number | undefined, busy: false });
  // The real engine looks for the file on disk; the scripted one knows only the catalog, so added models are looked up in the folder here.
  const known = fake.downloaded.bind(fake);
  fake.downloaded = async (id: string) =>
    id.startsWith("custom-")
      ? stat(join(dir, "stt", `${id}.bin`)).then(
          () => true,
          () => false,
        )
      : known(id);
  const cfg = { dictation: v.parse(DictationConfigSchema, {}) as DictationConfig, engines: parseEnginesConfig({}) };
  const state = { recording: false, saves: 0, changes: 0 };
  const speechRef: { current?: SpeechModels } = {};
  const models = new ModelManager({
    stt,
    selected: () => cfg.dictation.model,
    select: (id) => (cfg.dictation.model = id),
    changed: () => void state.changes++,
    models: () => speechRef.current!.catalog(),
    transfers: new Transfers(),
  });
  const speech = (speechRef.current = new SpeechModels({
    modelsDir: dir,
    stt,
    models,
    config: () => cfg,
    save: () => void state.saves++,
    choose: (id, language) => {
      cfg.dictation.model = id;
      cfg.dictation.language = language as never;
    },
    recording: () => state.recording,
    dictationSupported: () => true,
    hardware: async () => hw,
    pickFile: async () => undefined,
    openFolder: async () => undefined,
    openProxySettings: async () => undefined,
    memoryOf: async () => 1100,
    scanDirs: () => [],
    changed: () => void state.changes++,
    platform: "win32",
    now: () => 1000,
    ...over,
  }));
  return { fake, stt, cfg, state, models, speech };
}

describe("SpeechModels: switching", () => {
  it("loads the new model before saving the choice, and tells the person when the language was changed to fit", async () => {
    const { speech, models, cfg } = setup();
    cfg.dictation.language = "ar";
    await models.refresh();
    const r = await speech.use(PARAKEET);
    expect(r).toEqual({ ok: true });
    expect(cfg.dictation.model).toBe(PARAKEET);
    expect(cfg.dictation.language).toBe("en");
    expect(speech.view().models.find((m) => m.id === PARAKEET)!.languageNote).toContain("switched to English");
  });

  it("keeps the old model when the new one fails to load", async () => {
    const { speech, models, cfg, fake } = setup();
    await models.refresh();
    await fake.load(TURBO);
    fake.say({ loadError: "bad weights" });
    const r = await speech.use(PARAKEET);
    expect(r).toMatchObject({ ok: false, reason: "failed" });
    expect(cfg.dictation.model).toBe(TURBO);
    expect(fake.status().state).toBe("ready"); // the old model was brought back
  });

  it("is blocked during a recording", async () => {
    const { speech, models, state, fake } = setup();
    await models.refresh();
    state.recording = true;
    expect(await speech.use(PARAKEET)).toMatchObject({ ok: false, reason: "recording" });
    expect(fake.status().state).toBe("unloaded");
  });

  it("refuses a model that is not downloaded and one that is unknown", async () => {
    const { speech, models, fake } = setup();
    await fake.setInstalled(PARAKEET, false);
    await models.refresh();
    expect(await speech.use(PARAKEET)).toMatchObject({ ok: false, reason: "not-downloaded" });
    expect(await speech.use("nope")).toMatchObject({ ok: false, reason: "unknown" });
  });
});

describe("SpeechModels: device", () => {
  it("auto uses the card, the CPU choice loads no card, and the card choice wins again", async () => {
    const { speech } = setup();
    await speech.init();
    expect(speech.gpuWanted()).toBe(true);
    await speech.setDevice("cpu");
    expect(speech.gpuWanted()).toBe(false);
    await speech.setDevice("gpu");
    expect(speech.gpuWanted()).toBe(true);
  });

  it("a card that failed is remembered with its driver and skipped by auto; a new driver gets another try", async () => {
    const { speech, cfg, state } = setup();
    await speech.init();
    speech.onGpuFallback("no Vulkan device found");
    expect(cfg.engines.failedDevices).toEqual([{ ...RTX, reason: "no Vulkan device found", at: 1000 }]);
    expect(state.saves).toBe(1);
    expect(speech.gpuWanted()).toBe(false);
    cfg.engines.failedDevices = cfg.engines.failedDevices.map((f) => ({ ...f, driver: "older" }));
    expect(speech.gpuWanted()).toBe(true);
  });

  it("a real failure while the graphics card is not known is remembered and not called out of memory", async () => {
    const { speech, cfg } = setup({}, { platform: "win32", arch: "x64", avx2: true, cores: 8, memoryGb: 16 });
    await speech.init();
    speech.onGpuFallback("no Vulkan device found");
    expect(cfg.engines.failedDevices).toHaveLength(1);
    expect(cfg.engines.failedDevices[0]).toMatchObject({ reason: "no Vulkan device found", at: 1000 });
    expect(speech.view().device.movedToCpuByMemory).toBe(false);
  });

  it("out of memory moves to the CPU without marking the card as failed, and Try again clears the note", async () => {
    const { speech, cfg, fake } = setup();
    await speech.init();
    await fake.load(TURBO);
    speech.onGpuFallback("ggml_vulkan: out of device memory");
    expect(cfg.engines.failedDevices).toEqual([]);
    expect(speech.gpuWanted()).toBe(true);
    expect(speech.view().device.movedToCpuByMemory).toBe(true);
    await speech.retryGraphicsCard();
    expect(speech.view().device.movedToCpuByMemory).toBe(false);
  });

  it("try the graphics card again forgets failures and reloads while idle, never two copies", async () => {
    const { speech, cfg, stt, models } = setup();
    await speech.init();
    await models.refresh();
    await stt.load(TURBO);
    speech.onGpuFallback("device lost");
    const unload = vi.spyOn(stt, "unload");
    await speech.retryGraphicsCard();
    expect(cfg.engines.failedDevices).toEqual([]);
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it("does not reload a busy engine or during a recording", async () => {
    const { speech, stt, state } = setup();
    await speech.init();
    await stt.load(TURBO);
    const unload = vi.spyOn(stt, "unload");
    stt.busy = true;
    await speech.setDevice("cpu");
    stt.busy = false;
    state.recording = true;
    await speech.setDevice("gpu");
    expect(unload).not.toHaveBeenCalled();
  });

  it("times an integrated card once and remembers the winner per driver", async () => {
    const igpu = { name: "Intel UHD", driver: "27.1", integrated: true };
    const { speech, cfg } = setup({}, { platform: "win32", arch: "x64", gpu: igpu });
    await speech.init();
    expect(speech.timeIntegrated()).toBe(true);
    speech.onTimed("cpu");
    expect(cfg.engines.timedDevices).toEqual({ "Intel UHD|27.1": "cpu" });
    expect(speech.timeIntegrated()).toBe(false);
    expect(speech.gpuWanted()).toBe(false);
  });

  it("starts without graphics information when the probe finds nothing", async () => {
    const { speech } = setup({}, { platform: "win32", arch: "x64" });
    await speech.init();
    expect(speech.gpuWanted()).toBe(false);
  });
});

describe("SpeechModels: automatic switching", () => {
  it("a rule that matched during a recording is applied when the recording ends, not only at the next change of program", async () => {
    vi.useFakeTimers();
    try {
      const { speech, models, cfg, state } = setup();
      await models.refresh();
      cfg.engines.autoSwitch = { enabled: true, rules: [{ id: "r", app: "chat.exe", model: PARAKEET }] };
      cfg.dictation.model = TURBO;
      state.recording = true;
      speech.auto.update({ app: "chat.exe" });
      await vi.advanceTimersByTimeAsync(400);
      expect(cfg.dictation.model).toBe(TURBO);
      state.recording = false;
      speech.recordingEnded();
      await vi.advanceTimersByTimeAsync(50);
      expect(cfg.dictation.model).toBe(PARAKEET);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SpeechModels: idle release", () => {
  it("never releases a model that has a queued job or a recording", async () => {
    const { speech, stt, state } = setup();
    await stt.load(TURBO);
    stt.busy = true;
    const unload = vi.spyOn(stt, "unload");
    speech.idle.touch();
    expect(speech.idle.dueAt).toBeGreaterThan(0);
    speech.idle.stop();
    state.recording = true;
    speech.dispose();
    expect(unload).not.toHaveBeenCalled();
  });

  it("choosing never keeps no timer; choosing minutes starts one while a model is loaded", async () => {
    const { speech, stt } = setup();
    await stt.load(TURBO);
    speech.setIdleMinutes(0);
    expect(speech.idle.dueAt).toBeUndefined();
    speech.setIdleMinutes(30);
    expect(speech.idle.dueAt).toBeGreaterThan(Date.now());
    speech.dispose();
  });

  it("choosing minutes with nothing loaded starts no timer", () => {
    const { speech } = setup();
    speech.setIdleMinutes(5);
    expect(speech.idle.dueAt).toBeUndefined();
  });

  it("a used model counts the time of its last use", () => {
    const { speech, cfg } = setup();
    speech.used(TURBO);
    expect(cfg.engines.lastUsed[TURBO]).toBe(1000);
    speech.dispose();
  });
});

describe("SpeechModels: files on disk", () => {
  const stt = () => join(dir, "stt");

  it("delete frees the file and its partial, reports the bytes, and never touches the folder outside", async () => {
    const { speech, models } = setup();
    await mkdir(stt(), { recursive: true });
    await writeFile(join(stt(), "ggml-large-v3-turbo-q5_0.bin"), Buffer.alloc(64));
    await writeFile(join(stt(), "ggml-large-v3-turbo-q5_0.bin.part"), Buffer.alloc(6));
    await writeFile(join(dir, "mine.txt"), "keep");
    await models.refresh();
    expect(await speech.remove(TURBO)).toBe(70);
    await expect(stat(join(stt(), "ggml-large-v3-turbo-q5_0.bin"))).rejects.toThrow();
    expect((await stat(join(dir, "mine.txt"))).size).toBe(4);
  });

  it("imports through the file dialog, lists the model, and an invalid file copies nothing", async () => {
    const good = join(dir, "src.bin");
    await writeFile(good, Buffer.concat([Buffer.from("lmgg"), Buffer.alloc(1_000_100, 3)]));
    const bad = join(dir, "bad.bin");
    await writeFile(bad, Buffer.alloc(1_000_100, 1));
    const picks = [bad, good];
    const { speech } = setup({ pickFile: async () => picks.shift() });
    await speech.init();
    expect(await speech.importFile("multilingual", "")).toMatchObject({ ok: false, reason: "not-a-model" });
    await expect(stat(stt())).rejects.toThrow();
    const r = await speech.importFile("english", "My model");
    expect(r).toMatchObject({ ok: true, name: "My model", alreadyThere: false });
    const card = speech.view().models.find((m) => m.origin === "custom")!;
    expect(card).toMatchObject({ name: "My model", installed: true, languages: ["en"] });
    expect(speech.view().disk.total).toBe(1_000_104);
  });

  it("cancelling the file dialog changes nothing", async () => {
    const { speech } = setup({ pickFile: async () => undefined });
    expect(await speech.importFile("multilingual", "")).toEqual({ cancelled: true });
    expect(await speech.locateFile("custom-0123456789ab")).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("a deleted copy of an added model shows as a missing file until the same file is found again", async () => {
    const good = join(dir, "src.bin");
    await writeFile(good, Buffer.concat([Buffer.from("lmgg"), Buffer.alloc(1_000_100, 3)]));
    const picks: (string | undefined)[] = [good];
    const { speech } = setup({ pickFile: async () => picks.shift() });
    await speech.init();
    const r = await speech.importFile("multilingual", "");
    if (!("id" in r)) throw new Error("import failed");
    await rm(join(stt(), `${r.id}.bin`));
    await speech.refreshDisk();
    expect(speech.view().models.find((m) => m.id === r.id)).toMatchObject({ fileMissing: true, installed: false });
    expect(await speech.use(r.id)).toMatchObject({ ok: false, reason: "file-missing" });
    picks.push(good);
    expect(await speech.locateFile(r.id)).toMatchObject({ ok: true });
    expect(speech.view().models.find((m) => m.id === r.id)!.fileMissing).toBeUndefined();
  });

  it("scanning is read-only and adopting copies only what was found", async () => {
    const { speech, fake } = setup({ scanDirs: () => [join(dir, "Downloads")] });
    await fake.setInstalled(PARAKEET, false);
    await mkdir(join(dir, "Downloads"), { recursive: true });
    await writeFile(join(dir, "Downloads", "random.bin"), Buffer.alloc(100));
    expect(await speech.scanDisk()).toEqual([]);
    expect((await stat(join(dir, "Downloads", "random.bin"))).size).toBe(100);
    await speech.adoptFound([PARAKEET]); // nothing was found: nothing happens
    await expect(stat(stt())).rejects.toThrow();
  });
});

describe("SpeechModels: small settings", () => {
  it("a registry patch applies each choice the way its own setting does", async () => {
    const { speech, cfg } = setup();
    await speech.init();
    await applyEnginesPatch(speech, { device: "cpu", idleMinutes: 30, releaseOnClose: true, autoSwitch: { enabled: true, rules: [{ id: "a", layout: "de", model: TURBO }] } });
    expect(speech.gpuWanted()).toBe(false);
    expect(cfg.engines).toMatchObject({ device: "cpu", idleMinutes: 30, releaseOnClose: true, autoSwitch: { enabled: true, rules: [{ id: "a", layout: "de", model: TURBO }] } });
  });

  it("remembers the release setting, the dismissed hint (once), and going on without a model", () => {
    const { speech, cfg, state } = setup();
    expect(speech.setReleaseOnClose(true).releaseOnClose).toBe(true);
    speech.dismissNewer("custom-aaaaaaaaaaaa");
    speech.dismissNewer("custom-aaaaaaaaaaaa");
    expect(cfg.engines.dismissedHints).toEqual(["custom-aaaaaaaaaaaa"]);
    expect(speech.continueWithoutModel().skippedModel).toBe(true);
    expect(state.saves).toBe(4);
  });

  it("window release unloads the model only with the setting on and dictation off", async () => {
    const { speech, stt, cfg } = setup();
    await stt.load(TURBO);
    speech.windowReleased();
    await flush();
    expect(stt.status().state).toBe("ready");
    cfg.engines.releaseOnClose = true;
    cfg.dictation.enabled = true;
    speech.windowReleased();
    await flush();
    expect(stt.status().state).toBe("ready");
    cfg.dictation.enabled = false;
    speech.windowReleased();
    await flush();
    expect(stt.status().state).toBe("unloaded");
  });

  it("measures the memory of the loaded model and only then", async () => {
    const { speech, stt } = setup();
    expect((await speech.measureMemory()).models.find((m) => m.id === TURBO)!.memory).toBeUndefined();
    await stt.load(TURBO);
    const m = (await speech.measureMemory()).models.find((x) => x.id === TURBO)!.memory;
    expect(m).toEqual({ mb: 1100, setup: "graphics card, idle after loading, this computer" });
  });

  it("stores automatic switching rules as given", () => {
    const { speech, cfg } = setup();
    speech.setAutoSwitch({ enabled: true, rules: [{ id: "a", layout: "de", model: TURBO, language: "de" }] });
    expect(cfg.engines.autoSwitch).toEqual({ enabled: true, rules: [{ id: "a", layout: "de", model: TURBO, language: "de" }] });
  });

  it("asks for the keyboard layout only while a rule uses it", () => {
    const { speech } = setup();
    expect(speech.wantsLayout()).toBe(false);
    speech.setAutoSwitch({ enabled: true, rules: [{ id: "a", app: "chat.exe", model: TURBO }] });
    expect(speech.wantsLayout()).toBe(false);
    speech.setAutoSwitch({
      enabled: true,
      rules: [
        { id: "a", app: "chat.exe", model: TURBO },
        { id: "b", layout: "de", model: TURBO },
      ],
    });
    expect(speech.wantsLayout()).toBe(true);
    speech.setAutoSwitch({ enabled: false, rules: [{ id: "b", layout: "de", model: TURBO }] });
    expect(speech.wantsLayout()).toBe(false);
  });
});
