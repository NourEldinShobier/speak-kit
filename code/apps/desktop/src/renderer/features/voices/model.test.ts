import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import { filterVoices, genderLabel, initVoices, langLabel, previewText, voiceFilterLabel, voicesReducer, type VoiceFilter } from "./model";

const voice = (id: string, over: Partial<Voice> = {}): Voice => ({ id, name: id, lang: "en-US", gender: "female", quality: "A", traits: "", ...over }) as Voice;
const voices = [voice("Heart", { traits: "warm, calm" }), voice("Emma", { lang: "en-GB", traits: "clear" }), voice("Adam", { gender: "male", traits: "deep" })];

describe("voicesReducer", () => {
  it("loads the list and clears an earlier error", () => {
    const s = voicesReducer(voicesReducer(initVoices(), { type: "failed", message: "offline" }), { type: "loaded", voices });
    expect(s.error).toBe("");
    expect(s.voices).toHaveLength(3);
  });

  it("keeps the query and the filter", () => {
    const s = voicesReducer(voicesReducer(initVoices(), { type: "query", query: "wa" }), { type: "filter", filter: "male" });
    expect([s.query, s.filter]).toEqual(["wa", "male"]);
  });
});

describe("filterVoices", () => {
  it.each([
    ["", "all", ["Heart", "Emma", "Adam"]],
    ["", "en-GB", ["Emma"]],
    ["", "male", ["Adam"]],
    ["", "female", ["Heart", "Emma"]],
    ["WARM", "all", ["Heart"]],
    ["a", "en-US", ["Heart", "Adam"]],
    ["zzz", "all", []],
  ] as const)("query %j with filter %s shows %j", (query, filter, ids) => {
    expect(filterVoices(voices, query, filter).map((v) => v.id)).toEqual(ids);
  });
});

describe("voiceFilterLabel", () => {
  it("names the filter the way the toolbar dropdown shows it", () => {
    expect(["all", "en-US", "en-GB", "female", "male"].map((f) => voiceFilterLabel(f as VoiceFilter))).toEqual([
      "Voices: all",
      "Voices: US English",
      "Voices: UK English",
      "Voices: female",
      "Voices: male",
    ]);
  });
});

describe("voice labels", () => {
  it("names the language, the gender and the preview sentence", () => {
    expect([langLabel(voice("a")), langLabel(voice("b", { lang: "en-GB" })), genderLabel(voice("c")), genderLabel(voice("d", { gender: "male" }))]).toEqual([
      "US English",
      "UK English",
      "Female",
      "Male",
    ]);
    expect(previewText("Heart")).toBe("Hello, I am Heart. This is how I sound when reading to you.");
  });
});
