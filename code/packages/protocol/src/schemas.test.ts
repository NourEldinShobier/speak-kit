import { describe, expect, it } from "vite-plus/test";
import { engineListSchema, parseHealth, parseVoiceList } from "./schemas";
import * as v from "valibot";

const engine = { id: "chatterbox", state: "installing", progress: 0.4 };

describe("server response schemas", () => {
  it("accepts a health answer while an optional engine installs", () => {
    expect(parseHealth({ app: "speakkit", version: "1.0.0", apiVersion: 1, engine })?.engine).toEqual(engine);
  });

  it("parses a health answer of another API version so the client can report the mismatch", () => {
    expect(parseHealth({ app: "speakkit", version: "9.0.0", apiVersion: 2, engine })?.apiVersion).toBe(2);
  });

  it("rejects an unknown engine state and another app", () => {
    expect(parseHealth({ app: "speakkit", version: "1", apiVersion: 1, engine: { id: "kokoro", state: "asleep" } })).toBeUndefined();
    expect(parseHealth({ app: "other", version: "1", apiVersion: 1, engine })).toBeUndefined();
  });

  it("keeps the cloned flag of a voice", () => {
    const v = { id: "cb_0a1b2c3d", name: "Mine", lang: "en-US", gender: "female", quality: "B", cloned: true };
    expect(parseVoiceList({ voices: [v], default: v.id })?.voices[0]).toEqual(v);
  });

  it.each(["no-gpu", "python-missing", "not-installed", "out-of-memory", "disk-full"])("accepts the engine reason %s", (reason) => {
    const list = { active: "kokoro", engines: [{ id: "chatterbox", name: "Chatterbox", state: "missing", reason, optional: true, cloning: true }] };
    expect(v.parse(engineListSchema, list)).toEqual(list);
  });

  it("rejects an unknown engine reason", () => {
    const list = { active: "kokoro", engines: [{ id: "chatterbox", name: "Chatterbox", state: "missing", reason: "gremlins", optional: true, cloning: true }] };
    expect(v.safeParse(engineListSchema, list).success).toBe(false);
  });
});
