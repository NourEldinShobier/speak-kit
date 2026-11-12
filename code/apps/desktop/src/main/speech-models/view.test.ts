import { describe, expect, it } from "vite-plus/test";
import { DownloadError, STT_MODELS, importedAsModel } from "@speakkit/engine";
import { parseEnginesConfig } from "./test-support";
import { buildView, type ViewInput } from "./view";

const TURBO = "large-v3-turbo-q5_0";
const PARAKEET = "parakeet-tdt-0.6b-v3-q4_0";
const LARGE = "large-v3-q5_0";
const RTX = { name: "NVIDIA RTX 3060", driver: "31.0.15.5123" };
const CPU_ONLY = { platform: "win32", arch: "x64", avx2: true, cores: 8, memoryGb: 16 } as const;

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
    queued: undefined,
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
    expect(v.models.slice(0, 3).map((m) => [m.id, m.inUse, m.installed])).toEqual([
      [PARAKEET, true, true],
      [TURBO, false, true],
      ["tiny-q5_1", false, false],
    ]);
    expect(v.models[0]!.accuracy).toEqual([
      { language: "en", wrong: 10, of: 79 },
      { language: "de", wrong: 2, of: 90 },
    ]);
    expect(v.models[0]!.sha256).toBe("aa7fe2f5fb47d863ca23e8b1d490632d63a2599f515268b6d6bd656158dad45e");
    expect(v.models[0]!.memory).toBeUndefined(); // never shown unless measured on this computer
  });

  it("puts installed models before the ones that still need a download", () => {
    expect(
      buildView(input())
        .models.slice(0, 3)
        .map((m) => m.id),
    ).toEqual([TURBO, PARAKEET, "tiny-q5_1"]);
    expect(
      buildView(input({ selected: PARAKEET, installed: new Set([TURBO, "base"]) }))
        .models.slice(0, 4)
        .map((m) => m.id),
    ).toEqual([TURBO, "base", PARAKEET, "tiny-q5_1"]);
  });

  it("recommends the model measured best for the language when it is not installed, and says nothing when the model in use is recommended", () => {
    expect(buildView(input()).recommendation).toEqual({ model: LARGE, language: "en" });
    expect(buildView(input({ language: "de" })).recommendation).toBeUndefined();
    expect(buildView(input({ installed: new Set([TURBO, LARGE]) })).recommendation).toBeUndefined();
  });

  it("recommends the fast model for English and German on a computer without a graphics card, and the same table as with one on an Apple silicon Mac", () => {
    const cpu = buildView(input({ hardware: CPU_ONLY }));
    expect(cpu.recommendation).toEqual({ model: PARAKEET, language: "en" });
    expect(cpu.table.find((r) => r.language === "de")!.recommended).toBe(PARAKEET);
    expect(cpu.table.find((r) => r.language === "ar")!.recommended).toBe("small-q5_1");
    const mac = buildView(input({ hardware: { platform: "darwin", arch: "arm64", cores: 10, memoryGb: 16 } }));
    expect(mac.table.find((r) => r.language === "en")!.recommended).toBe(LARGE);
  });

  it("has exactly one recommended model per language row, with its measured figure, and marks it on the card", () => {
    const v = buildView(input());
    expect(v.models.find((m) => m.id === LARGE)!.recommendedFor).toEqual(["en"]);
    expect(v.models.find((m) => m.id === PARAKEET)!.recommendedFor).toEqual([]);
    expect(v.models.find((m) => m.id === TURBO)!.recommendedFor).toContain("de");
    expect(v.models.find((m) => m.id === TURBO)!.recommendedFor).not.toContain("en");
    expect(v.table.find((r) => r.language === "en")).toEqual({
      language: "en",
      recommended: LARGE,
      alsoWorks: [
        TURBO,
        PARAKEET,
        "tiny-q5_1",
        "tiny",
        "base-q5_1",
        "base",
        "small-q5_1",
        "small",
        "medium-q5_0",
        "medium",
        "large-v3",
        "large-v3-turbo-q8_0",
        "large-v3-turbo",
        "distil-large-v3",
        "parakeet-tdt-0.6b-v3-q8_0",
        "parakeet-ultra-q8_0",
      ],
      figure: { language: "en", wrong: 7, of: 79 },
      cpuOnly: PARAKEET,
      cpuSeconds: 2.5,
    });
    expect(v.table.find((r) => r.language === "fr")).toEqual({
      language: "fr",
      recommended: TURBO,
      alsoWorks: ["tiny-q5_1", "tiny", "base-q5_1", "base", "small-q5_1", "small", "medium-q5_0", "medium", "large-v3-q5_0", "large-v3", "large-v3-turbo-q8_0", "large-v3-turbo"],
      cpuOnly: "base-q5_1",
      cpuSeconds: 4.5,
    });
  });

  it("recommends on a computer without a card the fastest usable model for a language no model is quick in, with its speed", () => {
    const v = buildView(input({ hardware: CPU_ONLY, language: "ar" }));
    expect(v.table.find((r) => r.language === "ar")).toMatchObject({ recommended: "small-q5_1", cpuOnly: "small-q5_1", cpuSeconds: 16.8 });
    expect(v.models.find((m) => m.id === "small-q5_1")).toMatchObject({ speedSeconds: 16.8 });
  });

  it("gives the measured speed for the kind of computer: both on one with a card, the CPU's alone on one without, and says what the figures rest on", () => {
    const turbo = (v: ReturnType<typeof buildView>) => v.models.find((m) => m.id === TURBO)!;
    expect(turbo(buildView(input({ hardware: { ...CPU_ONLY, gpu: RTX } })))).toMatchObject({ speedSeconds: 0.2, speedOnCpuSeconds: 88 });
    const cpu = turbo(buildView(input({ hardware: CPU_ONLY })));
    expect(cpu.speedSeconds).toBe(88);
    expect(cpu.speedOnCpuSeconds).toBeUndefined();
    expect(turbo(buildView(input())).speedSeconds).toBe(0.2);
    expect(buildView(input()).sample).toEqual({
      recordings: { en: 4, de: 4, ar: 4 },
      words: { en: 79, de: 90, ar: 64 },
      machine: "NVIDIA GeForce RTX 4080 Laptop GPU and an Intel Core i9-13950HX processor (8 speech threads)",
    });
  });

  it("shows a model the person added without figures", () => {
    const custom = "custom-0123456789ab";
    const catalog = [
      ...STT_MODELS,
      importedAsModel({ id: custom, name: "Mine", file: `${custom}.bin`, sha256: "0".repeat(64), bytes: 100_000_000, engine: "whisper", kind: "multilingual", addedAt: 1, sourcePath: "C:/mine.bin" }),
    ];
    const mine = buildView(input({ catalog, installed: new Set([custom]) })).models.find((m) => m.id === custom)!;
    expect(mine.accuracy).toBeUndefined();
    expect(mine.speedSeconds).toBeUndefined();
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

  it("blocks the models that are too slow on the CPU of a weak computer and points to the floor model", () => {
    const v = buildView(input({ installed: new Set(), hardware: { platform: "win32", arch: "x64", avx2: true, cores: 2, memoryGb: 4 } }));
    const message = "This computer is too slow for the accurate model. Use Parakeet v3.";
    expect(v.models.find((m) => m.id === TURBO)!.blocked).toBe(message);
    expect(v.models.find((m) => m.id === "large-v3")!.blocked).toBe(message);
    expect(v.models.find((m) => m.id === "base")!.blocked).toBe(message);
    for (const quick of [PARAKEET, "parakeet-tdt-0.6b-v3-q8_0", "parakeet-ultra-q8_0", "tiny-q5_1", "tiny"]) expect(v.models.find((m) => m.id === quick)!.blocked, quick).toBeUndefined();
    expect(v.floor).toEqual({ message, useModel: PARAKEET });
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
    expect(v.models.slice(0, 3).map((m) => m.id)).toEqual([TURBO, custom, PARAKEET]);
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
