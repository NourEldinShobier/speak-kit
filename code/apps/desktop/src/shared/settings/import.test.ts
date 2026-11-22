import { describe, expect, it } from "vite-plus/test";
import { MAX_IMPORT_BYTES, planImport } from "./import";

describe("planImport", () => {
  it("takes valid app and dictation settings, with dictation named the way the registry names it", () => {
    const text = JSON.stringify({ voice: "af_bella", speed: 1.5, autoUpdate: false, dictation: { mode: "toggle", language: "en" } });
    expect(planImport(text)).toMatchObject({
      ok: true,
      change: { voice: "af_bella", speed: 1.5, autoUpdate: false, "dictation.mode": "toggle", "dictation.language": "en" },
      skipped: [],
    });
  });

  it("leaves out an invalid value, an unknown key and the setup state, and keeps the rest", () => {
    const text = JSON.stringify({ speed: 9, voice: "af_bella", colour: "red", setupDone: true, setupSkipped: true, setupStep: 2, language: "es", dictation: { mode: "sideways" } });
    expect(planImport(text)).toMatchObject({
      ok: true,
      change: { voice: "af_bella", language: "es" },
      skipped: ["speed", "colour", "setupDone", "setupSkipped", "setupStep", "dictation.mode"],
    });
  });

  it("does not take a prototype key", () => {
    const r = planImport('{"__proto__": {"voice": "x"}, "voice": "af_bella"}');
    expect(r).toMatchObject({ ok: true, change: { voice: "af_bella" }, skipped: ["__proto__"] });
  });

  it("does not take a prototype key inside dictation", () => {
    expect(planImport('{"dictation": {"__proto__": {"mode": "toggle"}}, "voice": "a"}')).toMatchObject({ ok: true, change: { voice: "a" }, skipped: ["dictation.__proto__"] });
  });

  it("treats a dictation value that is not an object as one unknown setting", () => {
    expect(planImport('{"voice":"a","dictation":[1]}')).toMatchObject({ ok: true, change: { voice: "a" }, skipped: ["dictation"] });
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

  it("names the areas the way the registry does and leaves out what belongs to one install", () => {
    const text = JSON.stringify({
      shortcuts: { "record-toggle": "Ctrl+Alt+S" },
      transcripts: { textDays: 90 },
      engines: { device: "cpu", failedDevices: [] },
      voiceChatVoice: "alloy",
    });
    expect(planImport(text)).toMatchObject({
      ok: true,
      change: { "shortcuts.record-toggle": "Ctrl+Alt+S", "transcripts.textDays": 90, "engines.device": "cpu", voiceChatVoice: "alloy" },
      skipped: ["engines.failedDevices"],
    });
  });

  it("lists the settings that need a confirmation and the ones that differ from what is set", () => {
    const text = JSON.stringify({ voice: "af_bella", speed: 1, transcripts: { notes: true } });
    const r = planImport(text, { voice: "af_heart", speed: 1 });
    expect(r).toMatchObject({ needsConfirmation: ["transcripts.notes"], changed: ["voice", "transcripts.notes"] });
  });

  it("asks about experiments only when the import would switch one on", () => {
    const on = JSON.stringify({ experiments: { x: true } });
    expect(planImport(on, {})).toMatchObject({ needsConfirmation: ["experiments"] });
    expect(planImport(JSON.stringify({ experiments: { x: false } }), { experiments: { x: true } })).toMatchObject({ needsConfirmation: [] });
    expect(planImport(on, { experiments: { x: true } })).toMatchObject({ needsConfirmation: [] });
  });

  it("leaves out the removed automation settings of an older settings file", () => {
    expect(planImport(JSON.stringify({ controlServer: false, mcpTools: { read_aloud: false }, voice: "af_bella" }))).toMatchObject({
      ok: true,
      change: { voice: "af_bella" },
      skipped: ["controlServer", "mcpTools"],
    });
  });

  it("asks before rewriting dictated text is switched on", () => {
    expect(planImport('{"dictation":{"rewrite":{"enabled":true,"deadlineMs":2000}}}')).toMatchObject({ needsConfirmation: ["dictation.rewrite"] });
  });

  it("does not take a prototype key inside an area", () => {
    expect(planImport('{"voice":"a","transcripts":{"__proto__":{"notes":true}}}')).toMatchObject({ change: { voice: "a" }, skipped: ["transcripts.__proto__"] });
  });

  it("leaves out the removed meetings section of an older settings file and takes the rest", () => {
    expect(planImport('{"voice":"a","meetings":{"enabled":true,"summary":true,"audioHours":24}}')).toMatchObject({ change: { voice: "a" }, skipped: ["meetings"] });
  });
});
