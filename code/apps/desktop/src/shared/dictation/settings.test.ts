import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { countDropped, DictationConfigSchema, DictationPatchSchema } from "./settings";

const CLEANUP = { fillers: true, spokenSymbols: true, spokenFormatting: true, autoCapitalize: true, trailingSpace: true, stripFinalStop: false };
const DEFAULTS = {
  enabled: false,
  hotkey: process.platform === "darwin" ? "AltRight" : "ControlRight",
  mode: "hold",
  pasteLastHotkey: "ControlLeft+AltLeft+KeyV",
  learnHotkey: "",
  cancelKey: "Escape",
  language: "en",
  model: "large-v3-turbo-q5_0",
  retention: "7d",
  microphone: "",
  avoidBluetooth: true,
  keepReady: false,
  output: "restore",
  skipPauses: false,
  terms: [],
  readAs: [],
  prompt: true,
  cleanup: CLEANUP,
  modes: [],
  rewrite: { enabled: false },
  rewriteWriter: "openai",
  rewriteDefault: "off",
  keepRecordings: false,
  smartSpacing: false,
  sounds: { enabled: false, volume: 50 },
  indicator: "bottom",
  audioCapMb: 512,
  duckAudio: "nothing",
  duckSpeakersOnly: true,
  duckLevel: 30,
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

  it("keeps the options of a word, and drops a word whose options have the wrong shape", () => {
    const word = { id: "a", word: " Claude Code ", soundsLike: [" cloud code "], app: " Code ", matchCase: true, remove: false, swapOnly: true };
    const learned = { heard: "cloud code", count: 2, createdAt: 5, left: "opened", sources: ["e1", "e2"] };
    const list = [
      word,
      { id: "b", word: "x", soundsLike: [], matchCase: "yes" },
      { id: "c", word: "Tauri", soundsLike: ["tory"], learned, suggested: true },
      { id: "d", word: "y", soundsLike: [], learned: { heard: "" } },
    ];
    expect(v.parse(DictationConfigSchema, { terms: list }).terms).toEqual([
      { id: "a", word: "Claude Code", soundsLike: ["cloud code"], app: "code", matchCase: true, remove: false, swapOnly: true },
      { id: "c", word: "Tauri", soundsLike: ["tory"], learned, suggested: true },
    ]);
  });

  it("keeps a word of 200 characters and a heard-as spelling of 80, and refuses more", () => {
    const long = { id: "a", word: "w".repeat(200), soundsLike: ["s".repeat(80)] };
    expect(v.parse(DictationConfigSchema, { terms: [long] }).terms).toEqual([long]);
    expect(
      v.parse(DictationConfigSchema, {
        terms: [
          { ...long, word: "w".repeat(201) },
          { ...long, id: "b", soundsLike: ["s".repeat(81)] },
        ],
      }).terms,
    ).toEqual([]);
  });

  it("allows the same word for two programs and a suggestion beside a saved word, but not the same word twice for one", () => {
    const a = { id: "a", word: "Claude Code", soundsLike: [] };
    const suggestion = { id: "s", word: "Claude Code", soundsLike: ["cloud code"], suggested: true, learned: { heard: "cloud code", count: 1, createdAt: 1 } };
    const ok = (terms: unknown[]) => v.safeParse(DictationPatchSchema, { terms }).success;
    expect(ok([a, { ...a, id: "b", app: "code" }, suggestion])).toBe(true);
    expect(ok([a, { ...a, id: "b" }])).toBe(false);
    expect(ok([suggestion, { ...suggestion, id: "t" }])).toBe(false);
    expect(v.parse(DictationConfigSchema, { terms: [a, { ...a, id: "b", app: "code" }, suggestion] }).terms).toHaveLength(3);
  });
});

describe("settings added after the first release", () => {
  it("a file written before them loads with each at its default", () => {
    const old = parseConfig({ dictation: { enabled: true, keepRecordings: true } }).dictation;
    expect(old).toMatchObject({ smartSpacing: false, sounds: { enabled: false, volume: 50 }, indicator: "bottom", audioCapMb: 512 });
  });

  it("keeps good values and replaces each bad one with its default", () => {
    const got = parseConfig({
      dictation: { smartSpacing: true, sounds: { enabled: true, volume: 130 }, indicator: "middle", audioCapMb: 300 },
    }).dictation;
    expect(got).toMatchObject({ smartSpacing: true, sounds: { enabled: true, volume: 50 }, indicator: "bottom", audioCapMb: 512 });
  });

  it("other audio is left alone and only muted for speakers by default, a file without the fields loads that way and a bad mode falls back", () => {
    expect(parseConfig({ dictation: { enabled: true } }).dictation).toMatchObject({ duckAudio: "nothing", duckSpeakersOnly: true });
    expect(parseConfig({ dictation: { duckAudio: "lower", duckSpeakersOnly: false } }).dictation).toMatchObject({ duckAudio: "lower", duckSpeakersOnly: false });
    expect(parseConfig({ dictation: { duckAudio: "silence", duckSpeakersOnly: "no" } }).dictation).toMatchObject({ duckAudio: "nothing", duckSpeakersOnly: true });
    const ok = (p: unknown) => v.safeParse(DictationPatchSchema, p).success;
    expect(ok({ duckAudio: "pause", duckSpeakersOnly: false })).toBe(true);
    expect(ok({ duckAudio: "silence" })).toBe(false);
  });

  it("the lowered volume is 30 percent by default, an out of range or fractional saved value falls back to it, and a patch accepts only whole percents from 0 to 100", () => {
    expect(parseConfig({ dictation: { enabled: true } }).dictation.duckLevel).toBe(30);
    expect(parseConfig({ dictation: { duckLevel: 0 } }).dictation.duckLevel).toBe(0);
    expect(parseConfig({ dictation: { duckLevel: 85 } }).dictation.duckLevel).toBe(85);
    for (const bad of [101, -5, 12.5, "40"]) expect(parseConfig({ dictation: { duckLevel: bad } }).dictation.duckLevel).toBe(30);
    const ok = (p: unknown) => v.safeParse(DictationPatchSchema, p).success;
    expect(ok({ duckLevel: 100 })).toBe(true);
    expect(ok({ duckLevel: 101 })).toBe(false);
    expect(ok({ duckLevel: 2.5 })).toBe(false);
  });

  it("a mode saved with replacements loads without them, and keeps its sites as host names", () => {
    const m = { id: "chat", name: "Chat", apps: ["slack"], rewrite: false, terms: [] };
    expect(parseConfig({ dictation: { modes: [{ ...m, replacements: [{ from: "ship it", to: "deploy" }] }] } }).dictation.modes[0]).toEqual({ ...m, sites: [], template: "tidy" });
    expect(parseConfig({ dictation: { modes: [{ ...m, sites: ["GitHub.com ", "x.org"] }] } }).dictation.modes[0]!.sites).toEqual(["github.com", "x.org"]);
    expect(parseConfig({ dictation: { modes: [{ ...m, sites: [3] }] } }).dictation.modes[0]!.sites).toEqual([]);
  });

  it("the renderer may change each of them and nothing else inside sounds", () => {
    const ok = (p: unknown) => v.safeParse(DictationPatchSchema, p).success;
    expect(ok({ smartSpacing: true, indicator: "top", audioCapMb: 2048, sounds: { enabled: true, volume: 0 } })).toBe(true);
    expect(ok({ indicator: "left" })).toBe(false);
    expect(ok({ audioCapMb: 1 })).toBe(false);
    expect(ok({ sounds: { enabled: true, volume: 101 } })).toBe(false);
    expect(ok({ sounds: { enabled: true, volume: 5, theme: "x" } })).toBe(false);
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
    ["the old list of replacements", { replacements: [{ from: "a", to: "x" }] }],
    ["the old list of corrections", { corrections: [] }],
  ])("refuses %s", (_why, patch) => {
    expect(v.safeParse(DictationPatchSchema, patch).success).toBe(false);
  });
});

describe("audio and output settings", () => {
  it("fall back to release-when-idle, restore the clipboard and avoid headset microphones", () => {
    const c = parseConfig({ dictation: { keepReady: "yes", output: "paste-all", avoidBluetooth: null } }).dictation;
    expect(c).toMatchObject({ keepReady: false, output: "restore", avoidBluetooth: true });
  });

  it("keeps good audio and output values", () => {
    const c = parseConfig({
      dictation: { microphone: "abc", keepReady: true, output: "keep" },
    }).dictation;
    expect(c).toMatchObject({ microphone: "abc", keepReady: true, output: "keep" });
  });

  it("ignores the removed sentencePause and blockSleep keys of an older config", () => {
    const c = parseConfig({ dictation: { sentencePause: false, blockSleep: false, output: "keep" } }).dictation;
    expect(c.output).toBe("keep");
    expect(c).not.toHaveProperty("sentencePause");
    expect(c).not.toHaveProperty("blockSleep");
  });

  it("loads a config that still has the removed hold-time, stay-open, return-to-app and raw-shortcut keys, gives them no effect and refuses them in a change", () => {
    const removed = { holdMs: 500, keepReadyMinutes: 15, returnToApp: false, rawHotkey: "F7" };
    const c = parseConfig({ dictation: { keepReady: true, ...removed } }).dictation;
    expect(c).toEqual({ ...DEFAULTS, keepReady: true });
    for (const [key, value] of Object.entries(removed)) expect(v.safeParse(DictationPatchSchema, { [key]: value }).success, key).toBe(false);
  });

  it("loads a mode saved with the removed insert, capitals and end choices and drops them", () => {
    const saved = { id: "m1", name: "Code", apps: ["code"], insertMode: "type", capitals: "keep", end: "no-full-stop", rewrite: true, terms: [] };
    expect(v.parse(DictationConfigSchema, { modes: [saved] }).modes).toEqual([{ id: "m1", name: "Code", apps: ["code"], sites: [], rewrite: true, template: "tidy", terms: [] }]);
  });

  it("ignores the removed micExclusions and appRules keys of an older config", () => {
    const c = parseConfig({ dictation: { micExclusions: ["yeti"], appRules: { putty: { method: "type", delayMs: 10 } }, output: "keep" } }).dictation;
    expect(c.output).toBe("keep");
    expect(c).not.toHaveProperty("micExclusions");
    expect(c).not.toHaveProperty("appRules");
  });

  it("loads a config from before skip pauses existed with it off, and keeps it on when set", () => {
    expect(parseConfig({ dictation: { keepReady: true } }).dictation.skipPauses).toBe(false);
    expect(parseConfig({ dictation: { skipPauses: true } }).dictation.skipPauses).toBe(true);
    expect(parseConfig({ dictation: { skipPauses: "yes" } }).dictation.skipPauses).toBe(false);
  });

  it("accepts them in a patch and refuses bad ones", () => {
    expect(v.safeParse(DictationPatchSchema, { keepReady: true, output: "copy" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { output: "paste" }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { appRules: {} }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { micExclusions: [] }).success).toBe(false);
  });
});

describe("vocabulary, modes and rewrite in the config", () => {
  it("loads a dictation section from before they existed with every new field at its default, and leaves the old replacements to the migration", () => {
    const old = parseConfig({
      dictation: { enabled: true, hotkey: "ControlRight", mode: "hold", language: "de", model: "large-v3-turbo-q5_0", retention: "30d", replacements: [{ from: "a", to: "b" }] },
    }).dictation;
    expect(old).toEqual({ ...DEFAULTS, enabled: true, hotkey: "ControlRight", language: "de", retention: "30d" });
  });

  it("keeps good words and drops each bad one, trimming and capping at 500", () => {
    const list = [{ id: "a", word: " Kubernetes ", soundsLike: ["cooper netties"] }, { id: "b", word: "", soundsLike: [] }, { id: "c" }, "x", { id: "d", word: "y".repeat(201), soundsLike: [] }];
    expect(v.parse(DictationConfigSchema, { terms: list }).terms).toEqual([{ id: "a", word: "Kubernetes", soundsLike: ["cooper netties"] }]);
    const many = Array.from({ length: 600 }, (_, i) => ({ id: `i${i}`, word: `w${i}`, soundsLike: [] }));
    expect(v.parse(DictationConfigSchema, { terms: many }).terms).toHaveLength(500);
    expect(v.parse(DictationConfigSchema, { terms: "no" }).terms).toEqual([]);
  });

  it("keeps good modes, lower-cases their apps and drops a mode with a wrong choice", () => {
    const mode = { id: "m1", name: "Code", apps: ["Code", "cursor"], rewrite: false, terms: [] };
    const got = v.parse(DictationConfigSchema, { modes: [mode, { ...mode, id: "m2", rewrite: "yes" }, { ...mode, id: "m3", name: "" }] }).modes;
    expect(got).toEqual([{ ...mode, apps: ["code", "cursor"], sites: [], template: "tidy" }]);
  });

  it("loads a mode saved before templates as Tidy, keeps a known template and falls back to Tidy for an unknown one", () => {
    const old = { id: "m1", name: "Mail", apps: [], rewrite: true, terms: [] };
    const template = (t: unknown) => v.parse(DictationConfigSchema, { modes: [{ ...old, template: t }] }).modes[0]?.template;
    expect(v.parse(DictationConfigSchema, { modes: [old] }).modes[0]?.template).toBe("tidy");
    expect(template("email")).toBe("email");
    expect(template("poem")).toBe("tidy");
    expect(template(3)).toBe("tidy");
    expect(v.safeParse(DictationPatchSchema, { modes: [{ ...old, template: "notes", sites: [] }] }).success).toBe(true);
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

  it("keeps good clean-up switches and falls back per switch, and ignores the rewrite time limit an older file still carries", () => {
    expect(v.parse(DictationConfigSchema, { cleanup: { fillers: false, trailingSpace: "yes" } }).cleanup).toEqual({ ...CLEANUP, fillers: false });
    // "lowercase" was a switch once; a saved file that still has it loads and the key is gone.
    expect(v.parse(DictationConfigSchema, { cleanup: { fillers: false, lowercase: true } }).cleanup).toEqual({ ...CLEANUP, fillers: false });
    expect(v.parse(DictationConfigSchema, { cleanup: 5 }).cleanup).toEqual(CLEANUP);
    expect(v.parse(DictationConfigSchema, { rewrite: { enabled: true, deadlineMs: 500 } }).rewrite).toEqual({ enabled: true });
    expect(v.parse(DictationConfigSchema, { rewrite: { enabled: true, deadlineMs: 9000 } }).rewrite).toEqual({ enabled: true });
    expect(v.parse(DictationConfigSchema, { rewrite: { enabled: true, deadlineMs: "slow" } }).rewrite).toEqual({ enabled: true });
  });

  it("chooses the writer of the rewrite pass: OpenAI unless saved otherwise, and a file saved before the choice existed keeps working", () => {
    const saved = { rewrite: { enabled: true, deadlineMs: 6000 } };
    expect(v.parse(DictationConfigSchema, saved)).toMatchObject({ rewrite: { enabled: true }, rewriteWriter: "openai", rewriteDefault: "off" });
    expect(v.parse(DictationConfigSchema, { ...saved, rewriteWriter: "local" }).rewriteWriter).toBe("local");
    expect(v.parse(DictationConfigSchema, { ...saved, rewriteWriter: "gpt" }).rewriteWriter).toBe("openai");
    expect(v.safeParse(DictationPatchSchema, { rewriteWriter: "local" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { rewriteWriter: "gpt" }).success).toBe(false);
  });

  it("stores the style for apps in no mode: off unless saved, one of the eight styles, and nothing else", () => {
    expect(v.parse(DictationConfigSchema, {}).rewriteDefault).toBe("off");
    expect(v.parse(DictationConfigSchema, { rewriteDefault: "email" }).rewriteDefault).toBe("email");
    expect(v.parse(DictationConfigSchema, { rewriteDefault: "poetry" }).rewriteDefault).toBe("off");
    expect(v.safeParse(DictationPatchSchema, { rewriteDefault: "notes" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { rewriteDefault: "off" }).success).toBe(true);
    expect(v.safeParse(DictationPatchSchema, { rewriteDefault: "poetry" }).success).toBe(false);
  });

  it("lets the renderer change them, refusing a list that is too long or a field it does not know", () => {
    const ok = (patch: unknown) => v.safeParse(DictationPatchSchema, patch).success;
    expect(ok({ terms: [{ id: "a", word: "w", soundsLike: [] }], prompt: false, keepRecordings: true })).toBe(true);
    expect(ok({ terms: Array.from({ length: 501 }, (_, i) => ({ id: `i${i}`, word: "w", soundsLike: [] })) })).toBe(false);
    expect(ok({ rewrite: { enabled: true } })).toBe(true);
    expect(ok({ rewrite: { enabled: true, deadlineMs: 4000 } })).toBe(false);
    expect(ok({ cleanup: { fillers: true } })).toBe(false);
    expect(ok({ unknown: 1 })).toBe(false);
  });

  it("keeps the rest of a mode when one of its words is broken, instead of losing the whole mode", () => {
    const mode = { id: "m1", name: "Code", apps: ["code"], rewrite: false };
    const good = { id: "t1", word: "pnpm", soundsLike: [] };
    const got = v.parse(DictationConfigSchema, { modes: [{ ...mode, terms: [good, { id: "t2", word: "" }, "x"] }] }).modes;
    expect(got).toEqual([{ ...mode, sites: [], template: "tidy", terms: [good] }]);
  });

  it("drops a repeated word, id or mode name on load and refuses them in a change from the renderer", () => {
    const a = { id: "a", word: "Kubernetes", soundsLike: [] };
    expect(v.parse(DictationConfigSchema, { terms: [a, { ...a, id: "b", word: "kubernetes" }, { ...a, word: "Other" }] }).terms).toEqual([a]);
    const ok = (patch: unknown) => v.safeParse(DictationPatchSchema, patch).success;
    expect(ok({ terms: [a, { ...a, id: "b", word: "KUBERNETES" }] })).toBe(false);
    expect(ok({ terms: [a, { ...a, word: "Other" }] })).toBe(false);
    const m = { id: "m1", name: "Code", apps: [], rewrite: false, terms: [a, { ...a, id: "z" }] };
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

  it("drops a saved default mode, which is built in, and refuses a mode called Default", () => {
    const base = { apps: ["code"], rewrite: true, terms: [] };
    const saved = v.parse(DictationConfigSchema, {
      modes: [
        { ...base, id: "default", name: "Default" },
        { ...base, id: "m1", name: "DEFAULT" },
        { ...base, id: "m2", name: "Code" },
      ],
    }).modes;
    expect(saved.map((m) => m.id)).toEqual(["m2"]);
    expect(v.safeParse(DictationPatchSchema, { modes: [{ ...base, id: "m1", name: " default " }] }).success).toBe(false);
    expect(v.safeParse(DictationPatchSchema, { modes: [{ ...base, id: "default", name: "Anything" }] }).success).toBe(false);
  });
});

describe("entries that loading leaves out", () => {
  const mode = { id: "m1", name: "Code", apps: [], rewrite: false };
  it("counts broken and repeated entries in every list, and broken words inside a kept mode", () => {
    expect(countDropped(undefined)).toBe(0);
    expect(countDropped({})).toBe(0);
    expect(countDropped({ terms: [{ id: "a", word: "x", soundsLike: [] }] })).toBe(0);
    expect(countDropped({ terms: [{ id: "a", word: "x", soundsLike: [] }, { id: "b" }, "junk", { id: "c", word: "X", soundsLike: [] }] })).toBe(3);
    expect(countDropped({ readAs: [{ id: "r" }], replacements: [{ from: "", to: "b" }] })).toBe(2);
    expect(countDropped({ readAs: [{ id: "r" }], replacements: [{ from: "", to: "b" }] }, ["vocabulary-one-list"])).toBe(1);
    expect(
      countDropped({
        modes: [
          { ...mode, terms: [{ id: "t", word: "w", soundsLike: [] }, { id: "u" }] },
          { ...mode, id: "m2", rewrite: "yes", terms: [{ id: "x" }] },
          { ...mode, id: "default", name: "Default" },
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
  it("keeps a choice to follow the keyboard language, and accepts it in a patch", () => {
    expect(parseConfig({ dictation: { language: "keyboard" } }).dictation.language).toBe("keyboard");
    expect(v.safeParse(DictationPatchSchema, { language: "keyboard" }).success).toBe(true);
  });
  it("keeps the model an earlier version saved and accepts the models added since", () => {
    expect(parseConfig({ dictation: { model: "parakeet-tdt-0.6b-v3-q4_0" } }).dictation.model).toBe("parakeet-tdt-0.6b-v3-q4_0");
    for (const id of ["tiny-q5_1", "base", "small-q5_1", "medium-q5_0", "large-v3", "large-v3-turbo-q8_0", "distil-large-v3", "parakeet-tdt-0.6b-v3-q8_0", "parakeet-ultra-q8_0"])
      expect(parseConfig({ dictation: { model: id } }).dictation.model, id).toBe(id);
    expect(parseConfig({ dictation: { model: "tiny.en" } }).dictation.model).toBe("large-v3-turbo-q5_0");
  });
  it("accepts an added model by its fingerprint id and nothing else that is not in the catalog", () => {
    expect(parseConfig({ dictation: { model: "custom-0123456789ab" } }).dictation.model).toBe("custom-0123456789ab");
    expect(parseConfig({ dictation: { model: "custom-xyz" } }).dictation.model).toBe("large-v3-turbo-q5_0");
    expect(parseConfig({ dictation: { model: "../../evil" } }).dictation.model).toBe("large-v3-turbo-q5_0");
  });
});
