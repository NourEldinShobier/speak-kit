import { describe, expect, it } from "vite-plus/test";
import type { ModelCard, SpeechModelsView } from "../shared/speech-models/contract";
import {
  accuracyIn,
  accuracyPercent,
  accuracyText,
  compareLanguages,
  compareTable,
  defaultCompare,
  deleteConfirm,
  deviceLine,
  etaText,
  failureText,
  hardwareLine,
  hiddenLine,
  languagesText,
  memoryText,
  recommendationText,
  recommendedText,
  sampleText,
  secondsText,
  sizeText,
  speedPercent,
  speedText,
  togglePicked,
  transferText,
  visibleModels,
  DEFAULT_FILTER,
} from "./speech-text";

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
  accuracy: [
    { language: "en", wrong: 4, of: 100 },
    { language: "de", wrong: 1, of: 12 },
  ],
  speedSeconds: 2,
  sha256: "00",
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
    expect(accuracyText(card(), "de")).toBe("About 1 wrong word in 12 (German test)");
    expect(accuracyText(card(), "ar")).toBe("About 1 wrong word in 25 (English test)");
    expect(accuracyText(card({ accuracy: [{ language: "de", wrong: 1, of: 20 }] }), "ar")).toBe("About 1 wrong word in 20 (German test)");
    expect(accuracyText(omit(card(), "accuracy"))).toBe("Not measured");
  });
  it("a sample with no wrong word says so instead of inventing a rate", () => {
    expect(accuracyText(card({ accuracy: [{ language: "en", wrong: 0, of: 79 }] }))).toBe("No wrong word in 79 test words (English test)");
  });
  it("one language only, with the missing ones named", () => {
    expect(accuracyIn(card(), "de")).toBe("About 1 wrong word in 12 (German test)");
    expect(accuracyIn(card(), "ar")).toBe("Not measured in Arabic");
  });
  it("names what the figures rest on", () => {
    expect(sampleText({ recordings: { en: 4, de: 4, ar: 4 }, words: { en: 79, de: 80, ar: 60 }, machine: "one test computer" })).toBe(
      "Measured by us on a small sample: 4 English (79 words), 4 German (80 words) and 4 Arabic (60 words) recordings, on one test computer. A computer with a slower processor or card is slower, and other speech will differ.",
    );
  });
  it("speed", () => {
    expect(speedText(card())).toBe("About 2 seconds");
    expect(speedText(parakeet)).toBe("Under a second");
    expect(speedText(omit(card(), "speedSeconds"))).toBe("Not measured");
    expect(speedText(card({ speedSeconds: 0.7, speedOnCpuSeconds: 3.7 }))).toBe("Under a second with a graphics card, about 3.7 seconds on the CPU alone");
  });
  it("seconds are named for what they are", () => {
    expect(secondsText(0.5)).toBe("Under a second");
    expect(secondsText(1)).toBe("Under a second");
    expect(secondsText(1.1)).toBe("About 1.1 seconds");
    expect(secondsText(9.9)).toBe("About 9.9 seconds");
    expect(secondsText(10)).toBe("About 10 seconds");
    expect(secondsText(89.6)).toBe("About 90 seconds");
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
    expect(deleteConfirm(card({ inUse: true }), view([card({ inUse: true })]))).toEqual({
      title: "Delete Whisper Large v3 Turbo?",
      body: "This frees 574 MB of disk space. Dictation stops until a model is downloaded.",
    });
  });
  it("does not warn when another model is installed", () => {
    expect(deleteConfirm(card({ inUse: true }), view([card({ inUse: true }), { ...parakeet, installed: true }])).body).toBe("This frees 574 MB of disk space.");
  });
  it("says the original of an added model is not touched", () => {
    expect(deleteConfirm(card({ origin: "custom", name: "Mine", diskBytes: 100_000_000 }), view([card(), card()])).body).toBe(
      "This frees 574 MB of disk space. The file you added it from is not touched.",
    );
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
  sample: { recordings: { en: 4, de: 4, ar: 4 }, words: { en: 79, de: 80, ar: 60 }, machine: "one test computer" },
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
    expect(deviceLine(base({ device: { ...base().device, backend: "cpu", movedToCpuByMemory: true } }))).toBe(
      "Running on the CPU. The graphics card ran out of memory, so speech moved to the CPU while idle. Only one copy is in memory, and the card is not marked as failed.",
    );
  });
  it("lists the detected hardware", () => {
    expect(hardwareLine(base({ device: { ...base().device, gpuName: "RTX 3060", driver: "31.0", cores: 16, memoryGb: 32 } }))).toBe("RTX 3060, driver 31.0. 16 processor threads. 32 GB memory");
    expect(hardwareLine(base())).toBe("No graphics card found");
  });
});

describe("bars", () => {
  it("accuracy is the share of words heard right", () => {
    expect(accuracyPercent(card())).toBe(96);
    expect(accuracyPercent(card(), "de")).toBe(92);
    expect(accuracyPercent(card({ accuracy: [{ language: "en", wrong: 0, of: 79 }] }))).toBe(100);
    expect(accuracyPercent(omit(card(), "accuracy"))).toBeUndefined();
  });
  it("speed is the share of a ten second sentence that is saved, between 0 and 100", () => {
    expect(speedPercent(card({ speedSeconds: 2 }))).toBe(80);
    expect(speedPercent(card({ speedSeconds: 0.5 }))).toBe(95);
    expect(speedPercent(card({ speedSeconds: 10 }))).toBe(0);
    expect(speedPercent(card({ speedSeconds: 40 }))).toBe(0);
    expect(speedPercent(card({ speedSeconds: 0 }))).toBe(100);
    expect(speedPercent(omit(card(), "speedSeconds"))).toBeUndefined();
  });
});

describe("compareTable", () => {
  const a = card({ name: "Whisper", recommendedFor: ["de", "ar"], inUse: true, installed: true, languages: ["auto", "en", "de"] });
  const b = card({
    name: "Parakeet",
    installed: false,
    bytes: 355_615_679,
    speedSeconds: 1,
    accuracy: [{ language: "en", wrong: 5, of: 90 }],
    recommendedFor: [],
    license: { name: "CC BY 4.0", url: "" },
  });
  it("lines the facts up one column per model, with the test language in every accuracy cell", () => {
    const t = compareTable([a, b]);
    expect(t.names).toEqual(["Whisper", "Parakeet"]);
    expect(t.rows.find((r) => r.label === "Accuracy")!.cells).toEqual(["About 1 wrong word in 25 (English test)", "About 1 wrong word in 18 (English test)"]);
    expect(t.rows.find((r) => r.label === "File size")!.cells).toEqual(["574 MB", "356 MB"]);
    expect(t.rows.find((r) => r.label === "Speed")!.cells).toEqual(["About 2 seconds", "Under a second"]);
    expect(t.rows.find((r) => r.label === "Recommended")!.cells).toEqual(["German and Arabic", "Not for a language"]);
    expect(t.rows.find((r) => r.label === "Status")!.cells).toEqual(["In use", "Not downloaded"]);
    expect(t.rows.find((r) => r.label === "Licence")!.cells).toEqual(["MIT", "CC BY 4.0"]);
  });
  it("shows one test language for every column and says Not measured in it for a model that was not run on it", () => {
    expect(compareTable([a, b], "de").rows[0]!.cells).toEqual(["About 1 wrong word in 12 (German test)", "Not measured in German"]);
  });
});

describe("compare picker", () => {
  const rec = card({ id: "r", recommendedFor: ["en"] });
  const use = card({ id: "u", inUse: true });
  const plain = (id: string) => card({ id });
  it("starts with the model in use, then the recommended ones, then the rest, up to four", () => {
    expect(defaultCompare([plain("a"), rec, plain("b"), use, plain("c")])).toEqual(["u", "r", "a", "b"]);
    expect(defaultCompare([plain("a"), plain("b")])).toEqual(["a", "b"]);
    expect(defaultCompare([plain("a"), plain("b"), plain("c")], 2)).toEqual(["a", "b"]);
  });
  it("lists each language once, as measured", () => {
    expect(compareLanguages([card(), card({ accuracy: [{ language: "ar", wrong: 1, of: 9 }] }), omit(card(), "accuracy")])).toEqual(["en", "de", "ar"]);
  });
  it("adds a model while there is room and removes it on the next click", () => {
    expect(togglePicked(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(togglePicked(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(togglePicked(["a", "b", "c", "d"], "e")).toEqual(["a", "b", "c", "d"]);
    expect(togglePicked(["a"], "b", 1)).toEqual(["a"]);
  });
  it("puts the models recommended for the chosen language first", () => {
    const de = card({ id: "de", recommendedFor: ["de"] });
    const en = card({ id: "en", recommendedFor: ["en"] });
    const none = card({ id: "none" });
    expect(visibleModels([none, en, de], { ...DEFAULT_FILTER, language: "de" }).shown.map((m) => m.id)).toEqual(["de", "none", "en"]);
    expect(visibleModels([none, en, de], DEFAULT_FILTER).shown.map((m) => m.id)).toEqual(["en", "de", "none"]);
  });
});
