import { describe, expect, it } from "vite-plus/test";
import { DownloadError, STT_MODELS } from "@speakkit/engine";
import { parseEnginesConfig } from "./test-support";
import { buildView, type ViewInput } from "./view";

const TURBO = "large-v3-turbo-q5_0";
const PARAKEET = "parakeet-tdt-0.6b-v3-q4_0";

function input(over: Partial<ViewInput> = {}): ViewInput {
  return {
    catalog: STT_MODELS,
    installed: new Set([TURBO]),
    missingFiles: new Set(),
    selected: TURBO,
    language: "en",
    config: parseEnginesConfig({}),
    hardware: undefined,
    transfers: [],
    preparing: undefined,
    failure: undefined,
    diskPerModel: { [TURBO]: 574_041_195 },
    diskTotal: 574_041_195,
    folder: "C:/models/stt",
    backend: undefined,
    movedToCpuByMemory: false,
    measured: undefined,
    switching: undefined,
    recording: false,
    dictationSupported: true,
    platform: "win32",
    languageNote: undefined,
    ...over,
  };
}

describe("speech models view", () => {
  it("lists the model in use first, with its size labelled as file size data and the test language of each figure", () => {
    const v = buildView(input({ selected: PARAKEET, installed: new Set([TURBO, PARAKEET]) }));
    expect(v.models.map((m) => [m.id, m.inUse, m.installed])).toEqual([
      [PARAKEET, true, true],
      [TURBO, false, true],
    ]);
    expect(v.models[0]!.accuracy).toEqual({ oneIn: 18, testLanguage: "en", source: "published English benchmark" });
    expect(v.models[0]!.memory).toBeUndefined(); // never shown unless measured on this computer
  });

  it("puts installed models before the ones that still need a download", () => {
    expect(buildView(input()).models.map((m) => m.id)).toEqual([TURBO, PARAKEET]);
    expect(buildView(input({ selected: PARAKEET, installed: new Set([TURBO]) })).models.map((m) => m.id)).toEqual([TURBO, PARAKEET]);
  });

  it("recommends the fast model for English when it is not installed, and says nothing when the model in use is recommended", () => {
    expect(buildView(input()).recommendation).toEqual({ model: PARAKEET, language: "en" });
    expect(buildView(input({ language: "de" })).recommendation).toBeUndefined();
    expect(buildView(input({ installed: new Set([TURBO, PARAKEET]) })).recommendation).toBeUndefined();
  });

  it("has exactly one recommended model per language row and marks it on the card", () => {
    const v = buildView(input());
    const turbo = v.models.find((m) => m.id === TURBO)!;
    const parakeet = v.models.find((m) => m.id === PARAKEET)!;
    expect(parakeet.recommendedFor).toEqual(["en"]);
    expect(turbo.recommendedFor).toContain("de");
    expect(turbo.recommendedFor).not.toContain("en");
    expect(v.table.find((r) => r.language === "auto")).toEqual({ language: "auto", recommended: TURBO, alsoWorks: [] });
  });

  it("shows no model installed as an empty state and remembers a choice to go on without one", () => {
    const v = buildView(input({ installed: new Set(), diskPerModel: {}, diskTotal: 0, config: parseEnginesConfig({ skippedModel: true }) }));
    expect(v.noModel).toBe(true);
    expect(v.skippedModel).toBe(true);
    expect(v.disk.total).toBe(0);
  });

  it("shows transfers, preparing, and a failure with the host", () => {
    const failure = new DownloadError({ kind: "unreachable", host: "huggingface.co", keptBytes: 214_000_000, message: "Could not reach the model server huggingface.co." });
    const v = buildView(
      input({
        transfers: [{ id: PARAKEET, state: "paused", fraction: 0.6 }],
        failure: { id: PARAKEET, error: failure },
        preparing: TURBO,
      }),
    );
    expect(v.models.find((m) => m.id === PARAKEET)).toMatchObject({
      transfer: { state: "paused", fraction: 0.6 },
      failure: { kind: "unreachable", host: "huggingface.co", keptBytes: 214_000_000, advice: "try-again" },
    });
    expect(v.models.find((m) => m.id === TURBO)!.transfer).toEqual({ state: "preparing", fraction: 1 });
  });

  it("blocks the accurate model on a computer that is too slow and points to the fast one", () => {
    const v = buildView(input({ installed: new Set(), hardware: { platform: "win32", arch: "x64", avx2: true, cores: 2, memoryGb: 4 } }));
    expect(v.models.find((m) => m.id === TURBO)!.blocked).toBe("This computer is too slow for the accurate model. Use the fast one.");
    expect(v.models.find((m) => m.id === PARAKEET)!.blocked).toBeUndefined();
    expect(v.floor?.message).toContain("too slow");
  });

  it("blocks every model without AVX2 and says what is missing", () => {
    const v = buildView(input({ hardware: { platform: "win32", arch: "x64", avx2: false } }));
    expect(v.models.every((m) => m.blocked?.includes("AVX2"))).toBe(true);
    expect(v.floor?.message).toContain("AVX2");
  });

  it("reports the device in use, the detected hardware, and warns about a slow CPU fallback", () => {
    const gpu = { name: "NVIDIA RTX 3060", driver: "31.0.15.5123" };
    const v = buildView(input({ backend: "cpu", hardware: { platform: "win32", arch: "x64", cores: 8, memoryGb: 16, gpu } }));
    expect(v.device).toMatchObject({ choice: "auto", backend: "cpu", gpuName: "NVIDIA RTX 3060", driver: "31.0.15.5123", cores: 8, memoryGb: 16, cpuWarning: true, movedToCpuByMemory: false });
    expect(buildView(input({ backend: "cpu", config: parseEnginesConfig({ device: "cpu" }), hardware: { platform: "win32", arch: "x64", gpu } })).device.cpuWarning).toBe(false);
    expect(buildView(input({ backend: "gpu", hardware: { platform: "win32", arch: "x64", gpu } })).device.cpuWarning).toBe(false);
  });

  it("an out-of-memory move to the CPU is flagged and leaves the failed list empty", () => {
    const v = buildView(input({ backend: "cpu", movedToCpuByMemory: true }));
    expect(v.device.movedToCpuByMemory).toBe(true);
    expect(v.device.failed).toEqual([]);
  });

  it("lists a missing model file and a measured memory with its setup", () => {
    const custom = "custom-0123456789ab";
    const catalog = [...STT_MODELS, { ...STT_MODELS[0]!, id: custom as never, name: "Mine", origin: "custom" as const }];
    const v = buildView(input({ catalog, installed: new Set([TURBO]), missingFiles: new Set([custom]), measured: { id: TURBO, mb: 1100, setup: "graphics card, idle after loading" } }));
    expect(v.models.find((m) => m.id === custom)!.fileMissing).toBe(true);
    expect(v.models.find((m) => m.id === TURBO)!.memory).toEqual({ mb: 1100, setup: "graphics card, idle after loading" });
    expect(v.models.map((m) => m.id)).toEqual([TURBO, custom, PARAKEET]);
  });

  it("marks automatic switching rules whose model is not downloaded", () => {
    const config = parseEnginesConfig({
      autoSwitch: {
        enabled: true,
        rules: [
          { id: "a", layout: "de", model: TURBO },
          { id: "b", app: "code", model: PARAKEET },
        ],
      },
    });
    const v = buildView(input({ config }));
    expect(v.autoSwitch.skippedRuleIds).toEqual(["b"]);
    expect(v.autoSwitch.rules).toHaveLength(2);
  });

  it("carries the language note of a model that did not handle the saved language", () => {
    const v = buildView(input({ languageNote: { model: PARAKEET, text: "switched to English" } }));
    expect(v.models.find((m) => m.id === PARAKEET)!.languageNote).toBe("switched to English");
  });

  it("shows the idle choice, the release setting, and the switching state", () => {
    const v = buildView(input({ config: parseEnginesConfig({ idleMinutes: 30, releaseOnClose: true }), switching: PARAKEET, recording: true, platform: "darwin", dictationSupported: false }));
    expect(v).toMatchObject({ idleMinutes: 30, releaseOnClose: true, switching: PARAKEET, recording: true, platform: "darwin", dictationSupported: false });
  });

  it("shows the dictation language as the model handles it", () => {
    expect(buildView(input({ selected: PARAKEET, installed: new Set([PARAKEET]), language: "ar" })).dictationLanguage).toBe("en");
  });
});
