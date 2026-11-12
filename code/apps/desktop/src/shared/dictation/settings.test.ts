import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { countDropped, DictationConfigSchema, DictationPatchSchema } from "./settings";

const CLEANUP = { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true, lowercase: false, stripFinalStop: false };
const DEFAULTS = {
  enabled: false,
  hotkey: process.platform === "darwin" ? "AltRight" : "ControlRight",
  mode: "hold",
  holdMs: 300,
  secondHotkey: "",
  mouseButton: "",
  rawHotkey: "",
  pasteLastHotkey: "ControlLeft+AltLeft+KeyV",
  cancelKey: "Escape",
  shareHotkey: false,
  pauseRules: { mode: "off", apps: [], fullscreen: false },
  language: "en",
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
  terms: [],
  readAs: [],
  prompt: true,
  cleanup: CLEANUP,
  modes: [],
  rewrite: { enabled: false, deadlineMs: 4000 },
  keepRecordings: false,
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
    ["an unknown language", { language: "tlh" }],
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

describe("vocabulary, modes and rewrite in the config", () => {
  it("loads a dictation section from before they existed with every new field at its default", () => {
    const old = parseConfig({
      dictation: { enabled: true, hotkey: "ControlRight", mode: "hold", language: "de", model: "large-v3-turbo-q5_0", retention: "30d", replacements: [{ from: "a", to: "b" }] },
    }).dictation;
    expect(old).toEqual({ ...DEFAULTS, enabled: true, hotkey: "ControlRight", language: "de", retention: "30d", replacements: [{ from: "a", to: "b" }] });
  });

  it("keeps good words and drops each bad one, trimming and capping at 500", () => {
    const list = [{ id: "a", word: " Kubernetes ", soundsLike: ["cooper netties"] }, { id: "b", word: "", soundsLike: [] }, { id: "c" }, "x", { id: "d", word: "y".repeat(61), soundsLike: [] }];
    expect(v.parse(DictationConfigSchema, { terms: list }).terms).toEqual([{ id: "a", word: "Kubernetes", soundsLike: ["cooper netties"] }]);
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `i${i}`, word: `w${i}`, soundsLike: [] }));
    expect(v.parse(DictationConfigSchema, { terms: many }).terms).toHaveLength(500);
    expect(v.parse(DictationConfigSchema, { terms: "no" }).terms).toEqual([]);
  });

  it("keeps good modes, lower-cases their apps and drops a mode with a wrong choice", () => {
    const mode = { id: "m1", name: "Code", apps: ["Code", "cursor"], insertMode: "paste", capitals: "keep", end: "no-full-stop", rewrite: false, terms: [] };
    const got = v.parse(DictationConfigSchema, { modes: [mode, { ...mode, id: "m2", capitals: "shout" }, { ...mode, id: "m3", name: "" }] }).modes;
    expect(got).toEqual([{ ...mode, apps: ["code", "cursor"], sites: [] }]);
  });

  it("gives a mode saved before websites existed an empty list, and keeps sites as host names, once each", () => {
    const old = { id: "m1", name: "Mail", apps: [], insertMode: "paste", capitals: "keep", end: "keep", rewrite: false, terms: [] };
    expect(v.parse(DictationConfigSchema, { modes: [old] }).modes[0]?.sites).toEqual([]);
    const sites = ["https://www.Mail.Google.com/inbox", "mail.google.com", "bad name", 5, "", "Example.org"];
    expect(v.parse(DictationConfigSchema, { modes: [{ ...old, sites }] }).modes[0]?.sites).toEqual([]); // one wrong entry type falls the whole list back
    expect(v.parse(DictationConfigSchema, { modes: [{ ...old, sites: sites.filter((x) => typeof x === "string") }] }).modes[0]?.sites).toEqual(["mail.google.com", "example.org"]);
    expect(v.parse(DictationConfigSchema, { modes: [{ ...old, sites: "mail.google.com" }] }).modes[0]?.sites).toEqual([]);
    expect(v.parse(DictationConfigSchema, { modes: [{ ...old, sites: Array.from({ length: 80 }, (_, i) => `s${i}.com`) }] }).modes[0]?.sites).toHaveLength(50);
  });

  it("keeps good clean-up switches and falls back per switch, and the rewrite deadline within 1 to 15 seconds", () => {
    expect(v.parse(DictationConfigSchema, { cleanup: { fillers: false, lowercase: true, trailingSpace: "yes" } }).cleanup).toEqual({ ...CLEANUP, fillers: false, lowercase: true });
    expect(v.parse(DictationConfigSchema, { cleanup: 5 }).cleanup).toEqual(CLEANUP);
    expect(v.parse(DictationConfigSchema, { rewrite: { enabled: true, deadlineMs: 500 } }).rewrite).toEqual({ enabled: true, deadlineMs: 4000 });
    expect(v.parse(DictationConfigSchema, { rewrite: { enabled: true, deadlineMs: 9000 } }).rewrite).toEqual({ enabled: true, deadlineMs: 9000 });
  });

  it("lets the renderer change them, refusing a list that is too long or a field it does not know", () => {
    const ok = (patch: unknown) => v.safeParse(DictationPatchSchema, patch).success;
    expect(ok({ terms: [{ id: "a", word: "w", soundsLike: [] }], prompt: false, keepRecordings: true })).toBe(true);
    expect(ok({ terms: Array.from({ length: 501 }, (_, i) => ({ id: `i${i}`, word: "w", soundsLike: [] })) })).toBe(false);
    expect(ok({ rewrite: { enabled: true, deadlineMs: 20_000 } })).toBe(false);
    expect(ok({ cleanup: { fillers: true } })).toBe(false);
    expect(ok({ unknown: 1 })).toBe(false);
  });

  it("keeps the rest of a mode when one of its words is broken, instead of losing the whole mode", () => {
    const mode = { id: "m1", name: "Code", apps: ["code"], insertMode: "paste", capitals: "keep", end: "keep", rewrite: false };
    const good = { id: "t1", word: "pnpm", soundsLike: [] };
    const got = v.parse(DictationConfigSchema, { modes: [{ ...mode, terms: [good, { id: "t2", word: "" }, "x"] }] }).modes;
    expect(got).toEqual([{ ...mode, sites: [], terms: [good] }]);
  });

  it("drops a repeated word, id or mode name on load and refuses them in a change from the renderer", () => {
    const a = { id: "a", word: "Kubernetes", soundsLike: [] };
    expect(v.parse(DictationConfigSchema, { terms: [a, { ...a, id: "b", word: "kubernetes" }, { ...a, word: "Other" }] }).terms).toEqual([a]);
    const ok = (patch: unknown) => v.safeParse(DictationPatchSchema, patch).success;
    expect(ok({ terms: [a, { ...a, id: "b", word: "KUBERNETES" }] })).toBe(false);
    expect(ok({ terms: [a, { ...a, word: "Other" }] })).toBe(false);
    const m = { id: "m1", name: "Code", apps: [], insertMode: "paste", capitals: "keep", end: "keep", rewrite: false, terms: [a, { ...a, id: "z" }] };
    expect(ok({ modes: [m] })).toBe(false);
    const clean = { ...m, terms: [a] };
    expect(ok({ modes: [clean, { ...clean, id: "m2", name: "code" }] })).toBe(false);
    expect(ok({ modes: [clean, { ...clean, name: "Chat" }] })).toBe(false);
    expect(ok({ modes: [clean, { ...clean, id: "m2", name: "Chat" }] })).toBe(true);
    expect(
      ok({
        readAs: [
          { id: "r", written: "a", spoken: "b" },
          { id: "r", written: "c", spoken: "d" },
        ],
      }),
    ).toBe(false);
  });

  it("keeps the default mode under its own name with no apps and refuses another mode called Default", () => {
    const base = { apps: ["code"], insertMode: "paste", capitals: "sentence", end: "keep", rewrite: true, terms: [] };
    const saved = v.parse(DictationConfigSchema, {
      modes: [
        { ...base, id: "default", name: "Anything" },
        { ...base, id: "m1", name: "DEFAULT" },
      ],
    }).modes;
    expect(saved).toEqual([{ ...base, id: "default", name: "Default", apps: [], sites: [] }]);
    expect(v.safeParse(DictationPatchSchema, { modes: [{ ...base, id: "m1", name: " default " }] }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { modes: [{ ...base, id: "default", name: "Default" }] }).success).toBe(true);
  });
});

describe("entries that loading leaves out", () => {
  const mode = { id: "m1", name: "Code", apps: [], insertMode: "paste", capitals: "keep", end: "keep", rewrite: false };
  it("counts broken and repeated entries in every list, and broken words inside a kept mode", () => {
    expect(countDropped(undefined)).toBe(0);
    expect(countDropped({})).toBe(0);
    expect(countDropped({ terms: [{ id: "a", word: "x", soundsLike: [] }] })).toBe(0);
    expect(countDropped({ terms: [{ id: "a", word: "x", soundsLike: [] }, { id: "b" }, "junk", { id: "c", word: "X", soundsLike: [] }] })).toBe(3);
    expect(countDropped({ readAs: [{ id: "r" }], replacements: [{ from: "", to: "b" }] })).toBe(2);
    expect(
      countDropped({
        modes: [
          { ...mode, terms: [{ id: "t", word: "w", soundsLike: [] }, { id: "u" }] },
          { ...mode, id: "m2", capitals: "shout", terms: [{ id: "x" }] },
        ],
      }),
    ).toBe(2);
  });
});

describe("languages and models", () => {
  it("starts on an explicit language, never on automatic detection", () => {
    expect(parseConfig({}).dictation.language).toBe("en");
  });
  it("keeps an automatic choice a person made earlier", () => {
    expect(parseConfig({ dictation: { language: "auto" } }).dictation.language).toBe("auto");
  });
  it("accepts an added model by its fingerprint id and nothing else that is not in the catalog", () => {
    expect(parseConfig({ dictation: { model: "custom-0123456789ab" } }).dictation.model).toBe("custom-0123456789ab");
    expect(parseConfig({ dictation: { model: "custom-xyz" } }).dictation.model).toBe("large-v3-turbo-q5_0");
    expect(parseConfig({ dictation: { model: "../../evil" } }).dictation.model).toBe("large-v3-turbo-q5_0");
  });
});
