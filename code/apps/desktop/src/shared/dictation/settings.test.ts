import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { DictationConfigSchema, DictationPatchSchema } from "./settings";

const DEFAULTS = {
  enabled: false,
  hotkey: "ControlRight",
  mode: "hold",
  language: "auto",
  model: "large-v3-turbo-q5_0",
  retention: "7d",
  replacements: [],
  microphone: "",
  micExclusions: [],
  avoidBluetooth: true,
  keepReady: false,
  keepReadyMinutes: 0,
  sentencePause: true,
  output: "restore",
  returnToApp: true,
  appRules: {},
  blockSleep: true,
  skipPauses: false,
};

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

describe("audio and output settings", () => {
  it("fall back to release-when-idle, restore the clipboard and avoid headset microphones", () => {
    const c = parseConfig({ dictation: { keepReady: "yes", output: "paste-all", keepReadyMinutes: -3, avoidBluetooth: null } }).dictation;
    expect(c).toMatchObject({ keepReady: false, output: "restore", keepReadyMinutes: 0, avoidBluetooth: true });
  });

  it("keeps good audio and output values", () => {
    const c = parseConfig({
      dictation: { microphone: "abc", micExclusions: ["yeti", "", "x".repeat(61), "cable"], keepReady: true, keepReadyMinutes: 30, output: "keep", sentencePause: false, blockSleep: false },
    }).dictation;
    expect(c).toMatchObject({ microphone: "abc", keepReady: true, keepReadyMinutes: 30, output: "keep", sentencePause: false, blockSleep: false });
  });

  it("drops the whole exclusion list when it has a bad entry, rather than guess", () => {
    expect(parseConfig({ dictation: { micExclusions: ["yeti", 4] } }).dictation.micExclusions).toEqual([]);
  });

  it("keeps good per-program rules, drops bad ones, and stores names without .exe in lower case", () => {
    const c = parseConfig({
      dictation: {
        appRules: { "PuTTY.exe": { method: "shift-insert", delayMs: 50 }, code: { method: "type" }, bad: { method: "fly" }, "": { method: "copy" }, mstsc: { method: "ctrl-v", delayMs: 99999 } },
      },
    }).dictation;
    expect(c.appRules).toEqual({ putty: { method: "shift-insert", delayMs: 50 }, code: { method: "type", delayMs: 0 }, mstsc: { method: "ctrl-v", delayMs: 0 } });
  });

  it("keeps program names that merely end in the letters exe", () => {
    const c = parseConfig({ dictation: { appRules: { complexe: { method: "type" }, nexe: { method: "copy" }, "putty.exe": { method: "type" } } } }).dictation;
    expect(Object.keys(c.appRules).sort()).toEqual(["complexe", "nexe", "putty"]);
  });

  it("loads a config from before skip pauses existed with it off, and keeps it on when set", () => {
    expect(parseConfig({ dictation: { keepReady: true } }).dictation.skipPauses).toBe(false);
    expect(parseConfig({ dictation: { skipPauses: true } }).dictation.skipPauses).toBe(true);
    expect(parseConfig({ dictation: { skipPauses: "yes" } }).dictation.skipPauses).toBe(false);
  });

  it("stops at 50 rules", () => {
    const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`app${i}`, { method: "copy" }]));
    expect(Object.keys(parseConfig({ dictation: { appRules: many } }).dictation.appRules)).toHaveLength(50);
  });

  it("accepts them in a patch and refuses bad ones", () => {
    expect(v.safeParse(DictationPatchSchema, { keepReady: true, output: "copy", appRules: { putty: { method: "type", delayMs: 10 } } }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { output: "paste" }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { keepReadyMinutes: 500 }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { appRules: { "bad/name": { method: "type", delayMs: 0 } } }).success).toBe(false);
  });
});
