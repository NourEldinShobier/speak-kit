import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { DictationConfigSchema, DictationPatchSchema } from "./settings";

const DEFAULTS = { enabled: false, hotkey: "ControlRight", mode: "hold", language: "auto", model: "large-v3-turbo-q5_0", retention: "7d", replacements: [] };

describe("dictation config", () => {
  it("is off, on Right Ctrl, hold to talk, for 7 days, until the person turns it on", () => {
    expect(parseConfig({}).dictation).toEqual(DEFAULTS);
  });

  it("loads a config.json written before dictation existed, and keeps everything else in it", () => {
    const old = parseConfig({ setupDone: true, speed: 1.5, voice: "bf_emma" });
    expect(old.dictation).toEqual(DEFAULTS);
    expect(old).toMatchObject({ setupDone: true, speed: 1.5, voice: "bf_emma" });
  });

  it("keeps good values and replaces each bad one with its default", () => {
    const got = parseConfig({ dictation: { enabled: true, hotkey: "KeyA", mode: "sideways", language: "de", model: "gone", retention: "30d" } }).dictation;
    expect(got).toEqual({ ...DEFAULTS, enabled: true, language: "de", retention: "30d" });
  });

  it("a section that is not an object falls back whole", () => {
    expect(parseConfig({ dictation: "yes" }).dictation).toEqual(DEFAULTS);
    expect(parseConfig({ dictation: null }).dictation).toEqual(DEFAULTS);
  });

  it("drops replacements with no text to match or the wrong shape, trims what it keeps, and stops at 100", () => {
    const list = [{ from: "  gonna ", to: "going to" }, { from: "", to: "x" }, { from: "a" }, "nope", null, { from: "tmrw", to: "tomorrow" }];
    expect(v.parse(DictationConfigSchema, { replacements: list }).replacements).toEqual([
      { from: "gonna", to: "going to" },
      { from: "tmrw", to: "tomorrow" },
    ]);
    const many = Array.from({ length: 150 }, (_, i) => ({ from: `w${i}`, to: "x" }));
    expect(v.parse(DictationConfigSchema, { replacements: many }).replacements).toHaveLength(100);
  });
});

describe("what the renderer may change", () => {
  it("accepts a partial change of the known keys", () => {
    expect(v.safeParse(DictationPatchSchema, { mode: "toggle", hotkey: "ControlLeft+AltLeft+Space" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, {}).success).toBe(true);
  });

  it.each([
    ["turning dictation on (it has its own call)", { enabled: true }],
    ["an unknown key", { anything: 1 }],
    ["a hotkey that is not allowed", { hotkey: "KeyA" }],
    ["an unknown language", { language: "fr" }],
    ["an unknown model", { model: "other" }],
    ["a replacement without text", { replacements: [{ from: "", to: "x" }] }],
    ["more than 100 replacements", { replacements: Array.from({ length: 101 }, () => ({ from: "a", to: "b" })) }],
  ])("refuses %s", (_why, patch) => {
    expect(v.safeParse(DictationPatchSchema, patch).success).toBe(false);
  });
});
