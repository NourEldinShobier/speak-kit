import { describe, expect, it } from "vite-plus/test";
import type { Voice } from "@speakkit/protocol";
import { filterVoices, genderLabel, initVoices, langLabel, previewText, voicesReducer } from "./model";

const voice = (id: string, over: Partial<Voice> = {}): Voice => ({ id, name: id, lang: "en-US", gender: "female", quality: "A", traits: "", ...over }) as Voice;
const voices = [voice("Heart", { traits: "warm, calm" }), voice("Emma", { lang: "en-GB", traits: "clear" }), voice("Adam", { gender: "male", traits: "deep" })];

describe("voicesReducer", () => {
  it("loads the list and clears an earlier error", () => {
    const s = voicesReducer(voicesReducer(initVoices(), { type: "failed", message: "offline" }), { type: "loaded", voices });
    expect(s.error).toBe("");
    expect(s.voices).toHaveLength(3);
  });

  it("keeps the query", () => {
    expect(voicesReducer(initVoices(), { type: "query", query: "wa" }).query).toBe("wa");
  });
});

describe("filterVoices", () => {
  it.each([
    ["", ["Heart", "Emma", "Adam"]],
    ["WARM", ["Heart"]],
    ["a", ["Heart", "Emma", "Adam"]],
    ["zzz", []],
  ] as const)("query %j shows %j", (query, ids) => {
    expect(filterVoices(voices, query).map((v) => v.id)).toEqual(ids);
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
