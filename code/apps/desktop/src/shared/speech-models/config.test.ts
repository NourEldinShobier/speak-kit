import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { DEVICE_CHOICES, IDLE_CHOICES, LANGUAGES, STT_MODELS } from "@speakkit/engine";
import { DICTATION_LANGUAGES, DICTATION_MODELS } from "../dictation/settings";
import { parseConfig } from "../schemas";
import { DEVICE_VALUES, EnginesConfigSchema, SPEECH_IDLE_CHOICES, SPOKEN_LANGUAGE_CODES } from "./config";

const DEFAULTS = { device: "auto", idleMinutes: 15, failedDevices: [], timedDevices: {}, releaseOnClose: false, autoSwitch: { enabled: false, rules: [] }, dismissedHints: [], skippedModel: false, lastUsed: {} };

describe("engines config", () => {
  it("defaults: device automatic, unload after 15 minutes, nothing remembered, switching off", () => {
    expect(v.parse(EnginesConfigSchema, {})).toEqual(DEFAULTS);
  });

  it("a config.json from before this section existed loads with the defaults and keeps everything else", () => {
    const c = parseConfig({ setupDone: true, voice: "af_heart", dictation: { enabled: true } });
    expect(c.engines).toEqual(DEFAULTS);
    expect(c.setupDone).toBe(true);
    expect(c.dictation.enabled).toBe(true);
  });

  it("a section that is not an object falls back whole", () => {
    expect(parseConfig({ engines: 7 }).engines).toEqual(DEFAULTS);
    expect(parseConfig({ engines: null }).engines).toEqual(DEFAULTS);
  });

  it("repairs bad values one at a time", () => {
    const e = v.parse(EnginesConfigSchema, { device: "tpu", idleMinutes: 7, releaseOnClose: "yes", skippedModel: true });
    expect(e).toMatchObject({ device: "auto", idleMinutes: 15, releaseOnClose: false, skippedModel: true });
  });

  it("keeps the idle choices of the page and the never choice", () => {
    for (const m of [5, 15, 30, 60, 0]) expect(v.parse(EnginesConfigSchema, { idleMinutes: m }).idleMinutes).toBe(m);
  });

  it("drops a bad failed-card entry and keeps the good ones, up to eight", () => {
    const good = { name: "RTX", driver: "1", reason: "lost", at: 5 };
    const e = v.parse(EnginesConfigSchema, { failedDevices: [good, { name: 3 }, null, good] });
    expect(e.failedDevices).toEqual([good, good]);
    expect(v.parse(EnginesConfigSchema, { failedDevices: Array.from({ length: 12 }, () => good) }).failedDevices).toHaveLength(8);
  });

  it("drops a bad switching rule and keeps the rest", () => {
    const rule = { id: "a", layout: "de", model: "large-v3-turbo-q5_0", language: "de" };
    const e = v.parse(EnginesConfigSchema, { autoSwitch: { enabled: true, rules: [rule, { id: "" }, "x"] } });
    expect(e.autoSwitch).toEqual({ enabled: true, rules: [rule] });
  });

  it("an autoSwitch section that is not an object falls back to off", () => {
    expect(v.parse(EnginesConfigSchema, { autoSwitch: "on" }).autoSwitch).toEqual({ enabled: false, rules: [] });
  });
});

describe("constants shared with the renderer match the engine", () => {
  it("idle choices, device choices and spoken languages", () => {
    expect([...SPEECH_IDLE_CHOICES]).toEqual([...IDLE_CHOICES]);
    expect([...DEVICE_VALUES]).toEqual([...DEVICE_CHOICES]);
    expect([...SPOKEN_LANGUAGE_CODES]).toEqual(LANGUAGES.map((l) => l.code));
    expect([...DICTATION_LANGUAGES]).toEqual(["auto", ...LANGUAGES.map((l) => l.code)]);
  });

  it("the settings accept every catalog model", () => {
    expect([...DICTATION_MODELS]).toEqual(STT_MODELS.filter((m) => m.origin === "builtin").map((m) => m.id));
  });
});
