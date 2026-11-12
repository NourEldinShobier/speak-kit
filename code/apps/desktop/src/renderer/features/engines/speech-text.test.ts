import { describe, expect, it } from "vite-plus/test";
import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { accuracyText, deleteConfirm, deviceLine, etaText, failureText, hardwareLine, hiddenLine, languagesText, memoryText, recommendationText, recommendedText, sizeText, speedText, transferText, visibleModels, DEFAULT_FILTER } from "./speech-text";

const card = (over: Partial<ModelCard> = {}): ModelCard => ({
  id: "large-v3-turbo-q5_0",
  name: "Whisper Large v3 Turbo",
  tag: "Accurate",
  description: "",
  bytes: 574_041_195,
  installed: true,
  inUse: false,
  languages: ["auto", "en", "de", "ar", "fr"],
  recommendedFor: [],
  license: { name: "MIT", url: "" },
  origin: "builtin",
  diskBytes: 574_041_195,
  accuracy: { oneIn: 25, testLanguage: "en", source: "published English benchmark" },
  speedSeconds: 2,
  ...over,
});
const omit = <K extends keyof ModelCard>(c: ModelCard, k: K): ModelCard => {
  const copy = { ...c };
  delete copy[k];
  return copy;
};
const parakeet = card({ id: "parakeet-tdt-0.6b-v3-q4_0", name: "Parakeet v3", tag: "Fast", bytes: 355_615_679, installed: false, diskBytes: 0, languages: ["en", "de"], speedSeconds: 1 });

describe("texts", () => {
  it("sizes", () => {
    expect(sizeText(574_041_195)).toBe("574 MB");
    expect(sizeText(1_500_000_000)).toBe("1.5 GB");
    expect(sizeText(0)).toBe("0 MB");
  });
  it("accuracy always names the test language; a model without a figure says not measured", () => {
    expect(accuracyText(card())).toBe("About 1 wrong word in 25 (English test)");
    expect(accuracyText(card({ accuracy: { oneIn: 12, testLanguage: "de", source: "x" } }))).toBe("About 1 wrong word in 12 (German test)");
    expect(accuracyText(omit(card(), "accuracy"))).toBe("Not measured");
  });
  it("speed", () => {
    expect(speedText(card())).toBe("About 2 seconds");
    expect(speedText(parakeet)).toBe("Under a second");
    expect(speedText(omit(card(), "speedSeconds"))).toBe("Not measured");
  });
  it("languages", () => {
    expect(languagesText(["auto", "en", "de", "ar", "fr"])).toBe("English, German, Arabic and more");
    expect(languagesText(["en", "de"])).toBe("English and German");
    expect(languagesText(["en"])).toBe("English");
    expect(languagesText(["auto"])).toBe("");
  });
  it("memory only when measured, with its setup", () => {
    expect(memoryText(card())).toBe("Not measured");
    expect(memoryText(card({ memory: { mb: 1100, setup: "graphics card" } }))).toBe("1100 MB while running (graphics card)");
  });
  it("recommended for", () => {
    expect(recommendedText(card())).toBe("");
    expect(recommendedText(card({ recommendedFor: ["en"] }))).toBe("for English");
    expect(recommendedText(card({ recommendedFor: ["de", "ar"] }))).toBe("for German and Arabic");
    expect(recommendedText(card({ recommendedFor: ["auto", "de", "ar", "fr", "es"] }))).toBe("for German, Arabic and 2 more");
  });
  it("time left", () => {
    expect(etaText(undefined)).toBe("");
    expect(etaText(30)).toBe("Less than a minute left.");
    expect(etaText(60)).toBe("About 1 minute left.");
    expect(etaText(150)).toBe("About 3 minutes left.");
  });
  it("transfers", () => {
    expect(transferText(card())).toBe("");
    expect(transferText(parakeet)).toBe("");
    expect(transferText({ ...parakeet, transfer: { state: "running", fraction: 0.6, etaSeconds: 180 } })).toBe("213 MB of 356 MB. About 3 minutes left.");
    expect(transferText({ ...parakeet, transfer: { state: "paused", fraction: 0.6 } })).toBe("Paused at 213 MB of 356 MB. The part already downloaded is kept.");
    expect(transferText({ ...parakeet, transfer: { state: "preparing", fraction: 1 } })).toBe("Getting the model ready. This takes a few seconds.");
  });
  it("failures keep what was downloaded, except a checksum failure that removed the file", () => {
    const f = { kind: "unreachable", message: "Could not reach the model server huggingface.co.", host: "huggingface.co", keptBytes: 214_000_000, advice: "try-again" };
    expect(failureText({ ...parakeet, failure: f })).toBe("Could not reach the model server huggingface.co. 214 MB are kept and the download resumes from there.");
    expect(failureText({ ...parakeet, failure: { ...f, kind: "checksum", keptBytes: 0 } })).toBe("Could not reach the model server huggingface.co.");
    expect(failureText(parakeet)).toBe("");
  });
});

const view = (models: ModelCard[]): Pick<SpeechModelsView, "models"> => ({ models });

describe("delete confirmation", () => {
  it("says how much disk it frees and that dictation stops when it was the last model in use", () => {
    expect(deleteConfirm(card({ inUse: true }), view([card({ inUse: true })]))).toEqual({ title: "Delete Whisper Large v3 Turbo?", body: "This frees 574 MB of disk space. Dictation stops until a model is downloaded." });
  });
  it("does not warn when another model is installed", () => {
    expect(deleteConfirm(card({ inUse: true }), view([card({ inUse: true }), { ...parakeet, installed: true }])).body).toBe("This frees 574 MB of disk space.");
  });
  it("says the original of an added model is not touched", () => {
    expect(deleteConfirm(card({ origin: "custom", name: "Mine", diskBytes: 100_000_000 }), view([card(), card()])).body).toBe("This frees 574 MB of disk space. The file you added it from is not touched.");
  });
});

describe("visibleModels", () => {
  const all = [parakeet, card({ inUse: true }), omit(card({ id: "custom-0123456789ab", name: "Mine", bytes: 100_000_000, languages: ["en"], origin: "custom" }), "speedSeconds")];
  it("keeps the model in use first whatever the sort", () => {
    expect(visibleModels(all, { ...DEFAULT_FILTER, sort: "size" }).shown.map((m) => m.name)).toEqual(["Whisper Large v3 Turbo", "Mine", "Parakeet v3"]);
    expect(visibleModels(all, { ...DEFAULT_FILTER, sort: "speed" }).shown.map((m) => m.name)).toEqual(["Whisper Large v3 Turbo", "Parakeet v3", "Mine"]);
  });
  it("downloaded only hides the rest and counts them", () => {
    const r = visibleModels(all, { ...DEFAULT_FILTER, downloadedOnly: true });
    expect(r.shown.map((m) => m.name)).toEqual(["Whisper Large v3 Turbo", "Parakeet v3", "Mine"].filter((n) => n !== "Parakeet v3"));
    expect(r.hidden).toBe(1);
    expect(hiddenLine(r.hidden)).toBe("1 model that is not downloaded is hidden.");
    expect(hiddenLine(2)).toBe("2 models that are not downloaded are hidden.");
    expect(hiddenLine(0)).toBe("");
  });
  it("the language filter keeps the models that handle it", () => {
    expect(visibleModels(all, { ...DEFAULT_FILTER, language: "ar" }).shown.map((m) => m.name)).toEqual(["Whisper Large v3 Turbo"]);
    expect(visibleModels(all, { ...DEFAULT_FILTER, language: "zz" }).shown).toEqual([]);
  });
  it("keeps the original order for equal keys", () => {
    expect(visibleModels([card({ id: "a" as never, name: "A" }), card({ id: "b" as never, name: "B" })], DEFAULT_FILTER).shown.map((m) => m.name)).toEqual(["A", "B"]);
  });
});

const base = (over: Partial<SpeechModelsView> = {}): SpeechModelsView => ({
  models: [card({ inUse: true }), parakeet],
  table: [],
  names: { "parakeet-tdt-0.6b-v3-q4_0": "Parakeet v3" },
  dictationLanguage: "en",
  idleMinutes: 15,
  device: { choice: "auto", failed: [], movedToCpuByMemory: false, cpuWarning: false },
  disk: { total: 0, folder: "" },
  releaseOnClose: false,
  autoSwitch: { enabled: false, rules: [], skippedRuleIds: [] },
  recording: false,
  noModel: false,
  skippedModel: false,
  dictationSupported: true,
  platform: "win32",
  ...over,
});

describe("recommendation, device and hardware lines", () => {
  it("names the model, the language and how fast it is on this computer", () => {
    expect(recommendationText(base({ recommendation: { model: "parakeet-tdt-0.6b-v3-q4_0", language: "en" } }))).toEqual({
      title: "For English, we recommend Parakeet v3",
      body: "You dictate in English. Under a second on this computer.",
      model: "parakeet-tdt-0.6b-v3-q4_0",
    });
    expect(recommendationText(base())).toBeUndefined();
  });
  it("says where speech runs and why", () => {
    expect(deviceLine(base())).toBe("Nothing is loaded now.");
    expect(deviceLine(base({ device: { ...base().device, backend: "gpu", gpuName: "RTX 3060" } }))).toBe("Running on RTX 3060.");
    expect(deviceLine(base({ device: { ...base().device, backend: "cpu", movedToCpuByMemory: true } }))).toBe("Running on the CPU. The graphics card ran out of memory, so speech moved to the CPU while idle. Only one copy is in memory, and the card is not marked as failed.");
  });
  it("lists the detected hardware", () => {
    expect(hardwareLine(base({ device: { ...base().device, gpuName: "RTX 3060", driver: "31.0", cores: 16, memoryGb: 32 } }))).toBe("RTX 3060, driver 31.0. 16 processor threads. 32 GB memory");
    expect(hardwareLine(base())).toBe("No graphics card found");
  });
});
