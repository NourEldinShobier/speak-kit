import { describe, expect, it } from "vite-plus/test";
import { MAX_IMPORT_BYTES, planImport } from "./import";

describe("planImport", () => {
  it("takes valid app and dictation settings, with dictation named the way the registry names it", () => {
    const text = JSON.stringify({ voice: "af_bella", speed: 1.5, startMinimized: true, dictation: { mode: "toggle", language: "en" } });
    expect(planImport(text)).toEqual({
      ok: true,
      change: { voice: "af_bella", speed: 1.5, startMinimized: true, "dictation.mode": "toggle", "dictation.language": "en" },
      skipped: [],
    });
  });

  it("leaves out an invalid value, an unknown key and the setup state, and keeps the rest", () => {
    const text = JSON.stringify({ speed: 9, voice: "af_bella", colour: "red", setupDone: true, setupSkipped: true, setupStep: 2, language: "es", dictation: { mode: "sideways" } });
    expect(planImport(text)).toEqual({
      ok: true,
      change: { voice: "af_bella", language: "es" },
      skipped: ["speed", "colour", "setupDone", "setupSkipped", "setupStep", "dictation.mode"],
    });
  });

  it("does not take a prototype key", () => {
    const r = planImport('{"__proto__": {"voice": "x"}, "voice": "af_bella"}');
    expect(r).toEqual({ ok: true, change: { voice: "af_bella" }, skipped: ["__proto__"] });
  });

  it("does not take a prototype key inside dictation", () => {
    expect(planImport('{"dictation": {"__proto__": {"mode": "toggle"}}, "voice": "a"}')).toEqual({ ok: true, change: { voice: "a" }, skipped: ["dictation.__proto__"] });
  });

  it("treats a dictation value that is not an object as one unknown setting", () => {
    expect(planImport('{"voice":"a","dictation":[1]}')).toEqual({ ok: true, change: { voice: "a" }, skipped: ["dictation"] });
  });

  it.each([
    ["not json", "the file is not valid JSON."],
    ["[1]", "the file does not hold settings."],
    ["null", "the file does not hold settings."],
    ['"text"', "the file does not hold settings."],
    ["{}", "the file has no settings that can be imported."],
    ['{"speed": 99}', "the file has no settings that can be imported."],
    ['{"setupDone": true}', "the file has no settings that can be imported."],
  ])("refuses %s", (text, message) => {
    expect(planImport(text)).toEqual({ ok: false, message });
  });

  it("refuses a file over the size limit", () => {
    expect(planImport(" ".repeat(MAX_IMPORT_BYTES + 1))).toEqual({ ok: false, message: "the file is too large to be a settings file." });
  });
});
