import { describe, expect, it } from "vite-plus/test";
import { engineListSchema, errorBodySchema, parseHealth, parseVoiceList } from "./schemas";
import * as v from "valibot";

const engine = { id: "kokoro", state: "downloading", progress: 0.4 };

describe("server response schemas", () => {
  it("accepts a health answer while the model downloads", () => {
    expect(parseHealth({ app: "speakkit", version: "1.0.0", apiVersion: 1, engine })?.engine).toEqual(engine);
  });

  it("parses a health answer of another API version so the client can report the mismatch", () => {
    expect(parseHealth({ app: "speakkit", version: "9.0.0", apiVersion: 2, engine })?.apiVersion).toBe(2);
  });

  it("rejects an unknown engine state and another app", () => {
    expect(parseHealth({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "asleep" } })).toBeUndefined();
    expect(parseHealth({ app: "other", version: "1", apiVersion: 1, engine })).toBeUndefined();
  });

  it("accepts the engine list", () => {
    const list = { active: "kokoro", engines: [{ id: "kokoro", name: "Kokoro", state: "downloading", progress: 0.4 }] };
    expect(v.parse(engineListSchema, list)).toEqual(list);
  });

  it("rejects an engine id that does not exist", () => {
    const list = { active: "kokoro", engines: [{ id: "gremlin", name: "Gremlin", state: "ready" }] };
    expect(v.safeParse(engineListSchema, list).success).toBe(false);
  });

  it("parses a voice list and an error body", () => {
    const voice = { id: "af_heart", name: "Heart", lang: "en-US", gender: "female", quality: "A" };
    expect(parseVoiceList({ voices: [voice], default: voice.id })?.voices[0]).toEqual(voice);
    const body = { error: { code: "invalid-request", message: "sentences: required" } };
    expect(v.parse(errorBodySchema, body)).toEqual(body);
  });
});
