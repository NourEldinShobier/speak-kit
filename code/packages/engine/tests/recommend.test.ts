import { describe, expect, it } from "vite-plus/test";
import { cpuFloorModel, quickOn, recommendFor, recommendedPreference, tenSecondSeconds, wrongWords, type Measured, type SttModel } from "../src";

const model = (id: string, bytes: number, languages: SttModel["languages"], measured?: Measured, extra: Partial<SttModel> = {}): SttModel =>
  ({ id, bytes, languages, detects: languages.includes("auto"), origin: "builtin", ...(measured && { measured }), ...extra }) as SttModel;

const ms = (gpuShort: number, gpuLong: number, cpuShort: number, cpuLong: number): Measured["ms"] => ({ gpu: { short: gpuShort, long: gpuLong }, cpu: { short: cpuShort, long: cpuLong } });

describe("wrongWords", () => {
  const m = model("a", 1, ["en"], { wrong: { en: { wrong: 2, of: 50 } }, ms: ms(1, 1, 1, 1) });
  it("reads the language's count", () => {
    expect(wrongWords(m, "en")).toEqual({ wrong: 2, of: 50 });
    expect(wrongWords(m, "de")).toBeUndefined();
  });
  it("has none for automatic detection or an unmeasured model", () => {
    expect(wrongWords(m, "auto")).toBeUndefined();
    expect(wrongWords({}, "en")).toBeUndefined();
  });
});

describe("tenSecondSeconds", () => {
  it("interpolates between the 4.6 s and 15.6 s recordings", () => {
    const m = model("a", 1, ["en"], { wrong: {}, ms: ms(400, 1000, 1000, 6600) });
    expect(tenSecondSeconds(m, "gpu")).toBe(0.7);
    expect(tenSecondSeconds(m, "cpu")).toBe(3.7);
  });
  it("is undefined without measurements", () => {
    expect(tenSecondSeconds({}, "cpu")).toBeUndefined();
  });
});

describe("quickOn", () => {
  it("allows 1.5 seconds on a graphics card and 3 on the CPU", () => {
    const on = (short: number, long: number) => model("a", 1, ["en"], { wrong: {}, ms: ms(short, long, short, long) });
    expect(quickOn(on(1500, 1500), "gpu")).toBe(true);
    expect(quickOn(on(1600, 1600), "gpu")).toBe(false);
    expect(quickOn(on(3000, 3000), "cpu")).toBe(true);
    expect(quickOn(on(3100, 3100), "cpu")).toBe(false);
    expect(quickOn({}, "cpu")).toBe(false);
  });
});

const quick = ms(300, 400, 500, 900);
const slowCpu = ms(300, 400, 9000, 20000);
const en = (wrong: number, of = 100): Measured["wrong"] => ({ en: { wrong, of } });

describe("recommendFor", () => {
  it("takes the smallest download among the quick models that are as accurate as the best", () => {
    const models = [
      model("tiny", 100, ["en"], { wrong: en(10), ms: quick }),
      model("small", 500, ["en"], { wrong: en(5), ms: quick }),
      model("mid", 700, ["en"], { wrong: en(4), ms: quick }),
      model("huge", 900, ["en"], { wrong: en(1), ms: ms(5000, 9000, 5000, 9000) }),
    ];
    expect(recommendFor(models, "en", "gpu")?.id).toBe("small");
  });

  it("keeps a model within one standard error of the best and drops one beyond it", () => {
    // 100 words, best 4 wrong: the standard error is 1.96 points, so 5 wrong stays and 6 wrong does not.
    const at = (id: string, bytes: number, wrong: number) => model(id, bytes, ["en"], { wrong: en(wrong), ms: quick });
    expect(recommendFor([at("best", 700, 4), at("within", 500, 5), at("beyond", 100, 6)], "en", "gpu")?.id).toBe("within");
  });

  it("takes a wider band on fewer words", () => {
    // The same 4-point gap: within the band of 25 words (2 vs 3 wrong), beyond the band of 100 words (8 vs 12 wrong).
    const at = (id: string, bytes: number, wrong: number, of: number) => model(id, bytes, ["en"], { wrong: en(wrong, of), ms: quick });
    expect(recommendFor([at("best", 700, 2, 25), at("other", 100, 3, 25)], "en", "gpu")?.id).toBe("other");
    expect(recommendFor([at("best", 700, 8, 100), at("other", 100, 12, 100)], "en", "gpu")?.id).toBe("best");
  });

  it("uses the CPU timings for a computer without a card", () => {
    const models = [model("fast", 500, ["en"], { wrong: en(5), ms: quick }), model("accurate", 300, ["en"], { wrong: en(1), ms: slowCpu })];
    expect(recommendFor(models, "en", "gpu")?.id).toBe("accurate");
    expect(recommendFor(models, "en", "cpu")?.id).toBe("fast");
  });

  it("ranks a language that was not measured by the model's average over the languages that were", () => {
    const models = [
      model("a", 100, ["auto", "en", "de", "fr"], { wrong: { en: { wrong: 10, of: 100 }, de: { wrong: 30, of: 100 } }, ms: quick }),
      model("b", 200, ["auto", "en", "de", "fr"], { wrong: { en: { wrong: 5, of: 100 }, de: { wrong: 5, of: 100 } }, ms: quick }),
    ];
    expect(recommendFor(models, "fr", "gpu")?.id).toBe("b");
    expect(recommendFor(models, "auto", "gpu")?.id).toBe("b");
  });

  it("offers automatic detection only through a model that detects", () => {
    const m = model("e", 100, ["en"], { wrong: en(0), ms: quick });
    expect(recommendFor([m], "auto", "gpu")).toBeUndefined();
  });

  it("has nothing for a language no quick measured model handles, and ignores added models and unmeasured ones", () => {
    const added = model("custom-1", 1, ["en"], { wrong: en(0), ms: quick }, { origin: "custom" });
    expect(recommendFor([added, model("n", 1, ["en"])], "en", "gpu")).toBeUndefined();
    expect(recommendFor([model("a", 1, ["en"], { wrong: en(0), ms: quick })], "de", "gpu")).toBeUndefined();
  });
});

describe("recommendedPreference", () => {
  it("lists a model for every language some quick model handles", () => {
    const models = [model("a", 100, ["auto", "en", "de"], { wrong: { en: { wrong: 1, of: 100 }, de: { wrong: 2, of: 100 } }, ms: quick })];
    expect(recommendedPreference(models, "gpu")).toEqual({ auto: "a", en: "a", de: "a" });
  });
});

describe("cpuFloorModel", () => {
  it("is the English recommendation among the models quick on the CPU", () => {
    const models = [
      model("tiny", 30, ["en"], { wrong: en(30), ms: quick }),
      model("base", 60, ["en"], { wrong: en(12), ms: quick }),
      model("small", 190, ["en"], { wrong: en(4), ms: quick }),
      model("mid", 500, ["en"], { wrong: en(2), ms: slowCpu }),
    ];
    expect(cpuFloorModel(models)?.id).toBe("small");
    expect(cpuFloorModel([models[0]!, models[3]!])?.id).toBe("tiny");
    expect(cpuFloorModel([models[3]!])).toBeUndefined();
  });
  it("does not count a model that was not run on English, or one the person added", () => {
    const noEnglish = model("de", 10, ["de"], { wrong: { de: { wrong: 0, of: 50 } }, ms: quick });
    const added = model("custom-1", 10, ["en"], { wrong: en(0), ms: quick }, { origin: "custom" });
    expect(cpuFloorModel([noEnglish, added])).toBeUndefined();
  });
});

describe("a model too inaccurate to use", () => {
  it("is not recommended for the language, even when it is the only quick one", () => {
    const bad = model("bad", 30, ["en"], { wrong: en(31), ms: quick });
    const edge = model("edge", 30, ["en"], { wrong: en(30), ms: quick });
    expect(recommendFor([bad], "en", "gpu")).toBeUndefined();
    expect(recommendFor([edge], "en", "gpu")?.id).toBe("edge");
  });
});
