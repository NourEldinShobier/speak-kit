import { describe, expect, it } from "vite-plus/test";
import type { ModelCard, SpeechModelsView } from "../../../shared/speech-models/contract";
import { afterLanguage, checklist, defaultLanguage, languageChoice, practiceDone, practiceStage, seenPress } from "./dictation-step";

const card = (over: Partial<ModelCard>): ModelCard => ({
  id: "large-v3-turbo-q5_0",
  name: "Whisper Large v3 Turbo",
  tag: "Accurate",
  description: "",
  bytes: 574_041_195,
  installed: false,
  inUse: false,
  languages: ["auto", "en", "de", "ar"],
  recommendedFor: [],
  license: { name: "MIT", url: "" },
  origin: "builtin",
  diskBytes: 0,
  accuracy: [
    { language: "en", wrong: 4, of: 100 },
    { language: "de", wrong: 1, of: 12 },
  ],
  speedSeconds: 2,
  sha256: "00",
  ...over,
});
const parakeet = card({ id: "parakeet-tdt-0.6b-v3-q4_0", name: "Parakeet v3", bytes: 355_615_679, speedSeconds: 1, accuracy: [{ language: "en", wrong: 5, of: 90 }] });
const whisper = card({});
const view = {
  models: [whisper, parakeet],
  table: [
    { language: "auto", recommended: whisper.id, alsoWorks: [] },
    { language: "en", recommended: parakeet.id, alsoWorks: [whisper.id] },
    { language: "de", recommended: whisper.id, alsoWorks: [parakeet.id] },
  ],
} as unknown as SpeechModelsView;

describe("defaultLanguage", () => {
  it("preselects the system language when it is offered", () => {
    expect(defaultLanguage("de-DE", ["en", "de", "ar"])).toBe("de");
    expect(defaultLanguage("DE_at", ["en", "de"])).toBe("de");
  });
  it("falls back to English for a language that is not offered, an empty locale, or automatic", () => {
    expect(defaultLanguage("ja-JP", ["en", "de"])).toBe("en");
    expect(defaultLanguage("", ["en"])).toBe("en");
    expect(defaultLanguage("auto", ["auto", "en"])).toBe("en");
  });
});

describe("languageChoice", () => {
  it("shows the model that fits, its size, and the figure with its test language", () => {
    const c = languageChoice(view, "en")!;
    expect(c.title).toBe("English");
    expect(c.model.name).toBe("Parakeet v3");
    expect(c.detail).toBe("Uses Parakeet v3, 356 MB. Very fast. 1 wrong word in 18 (English test).");
    expect(c.noDownload).toBe(false);
  });
  it("shows the figure of the chosen language when the model was measured in it", () => {
    expect(languageChoice(view, "de")!.detail).toBe("Uses Whisper Large v3 Turbo, 574 MB. 1 wrong word in 12 (German test).");
  });
  it("detecting the language says it is slower and can mistranscribe close languages", () => {
    expect(languageChoice(view, "auto")!.detail).toBe("Uses Whisper Large v3 Turbo, 574 MB. Slower, handles mixed languages. It can mistranscribe close languages.");
  });
  it("marks a model that is installed or found on disk as needing no download", () => {
    expect(languageChoice(view, "de", ["large-v3-turbo-q5_0"])!.noDownload).toBe(true);
    expect(languageChoice({ ...view, models: [{ ...whisper, installed: true }, parakeet] } as SpeechModelsView, "de")!.noDownload).toBe(true);
  });
  it("is undefined for a language with no row", () => {
    const slow = { ...view, models: [{ ...whisper, speedSeconds: 88 }, parakeet] } as SpeechModelsView;
    expect(languageChoice(slow, "de")!.detail).toBe("Uses Whisper Large v3 Turbo, 574 MB. 1 wrong word in 12 (German test). Slow on this computer: about 88 seconds for ten seconds of speech.");
    expect(languageChoice(view, "zz")).toBeUndefined();
  });
});

describe("afterLanguage", () => {
  const choice = (installed: boolean) => languageChoice({ ...view, models: [{ ...parakeet, installed }, whisper] } as SpeechModelsView, "en")!;
  it("uses an installed model, adopts a found one, and downloads only otherwise", () => {
    expect(afterLanguage(choice(true), false)).toBe("use");
    expect(afterLanguage(choice(false), true)).toBe("adopt");
    expect(afterLanguage(choice(false), false)).toBe("download");
  });
});

describe("checklist", () => {
  const ok = { mic: "granted", hotkeyLabel: "Right Ctrl", hotkeyReady: true, hotkeyFailed: false, modelName: "Parakeet v3", modelBytes: 355_615_679, modelInstalled: true } as const;
  it("is all ready when everything works", () => {
    expect(checklist(ok).map((r) => [r.id, r.ok, r.fix])).toEqual([
      ["microphone", true, undefined],
      ["hotkey", true, undefined],
      ["model", true, undefined],
    ]);
  });
  it("offers Fix hotkey with the reason when the hotkey could not start", () => {
    const r = checklist({ ...ok, hotkeyReady: false, hotkeyFailed: true })[1]!;
    expect(r).toMatchObject({ ok: false, fix: "fix-hotkey", detail: "Right Ctrl could not start. Another app may be using it." });
  });
  it("says the hotkey has not started yet when it is neither ready nor failed", () => {
    expect(checklist({ ...ok, hotkeyReady: false })[1]).toMatchObject({ ok: false, detail: "Not started yet.", fix: "fix-hotkey" });
  });
  it("offers the download when the model is missing and names a blocked microphone", () => {
    expect(checklist({ ...ok, modelInstalled: false })[2]).toMatchObject({ ok: false, fix: "download", detail: "Parakeet v3 is not installed yet." });
    expect(checklist({ ...ok, mic: "denied" })[0]!.ok).toBe(false);
    expect(checklist({ ...ok, mic: "denied" })[0]).toMatchObject({ fix: "open-mic-settings" });
    expect(checklist(ok)[0]).not.toHaveProperty("fix");
    expect(checklist({ ...ok, mic: "unknown" })[0]!.ok).toBe(true);
  });
});

describe("practiceDone", () => {
  it("needs text, not blanks", () => {
    expect(practiceDone("hello")).toBe(true);
    expect(practiceDone("   \n")).toBe(false);
    expect(practiceDone("")).toBe(false);
  });
});

describe("practiceStage", () => {
  const base = { hotkeyReady: true, hotkeyFailed: false, phase: "idle", pressed: false, text: "" };
  it("waits until the hotkey listener is live before it says it is the person's turn", () => {
    expect(practiceStage({ ...base, hotkeyReady: false })).toBe("waiting");
    expect(practiceStage(base)).toBe("ready");
  });
  it("says so when the hotkey could not start, even if it was ready before", () => {
    expect(practiceStage({ ...base, hotkeyFailed: true })).toBe("failed");
    expect(practiceStage({ ...base, hotkeyReady: false, hotkeyFailed: true })).toBe("failed");
  });
  it("is listening while a press is handled and worked once a press finished", () => {
    for (const phase of ["recording", "locked", "transcribing", "pasting"]) expect(practiceStage({ ...base, phase, pressed: true })).toBe("listening");
    expect(practiceStage({ ...base, pressed: true })).toBe("worked");
    expect(practiceStage({ ...base, phase: "error", pressed: true })).toBe("worked");
  });
  it("counts words in the field as success without a seen press, and blanks as nothing", () => {
    expect(practiceStage({ ...base, text: "hello" })).toBe("worked");
    expect(practiceStage({ ...base, text: "  \n" })).toBe("ready");
  });
  it("a press that was never answered while the listener is down does not count as success", () => {
    expect(practiceStage({ ...base, hotkeyReady: false, pressed: true })).toBe("waiting");
  });
});

describe("seenPress", () => {
  it("latches on the first handled phase and stays", () => {
    expect(seenPress(false, "idle")).toBe(false);
    expect(seenPress(false, "error")).toBe(false);
    expect(seenPress(false, "recording")).toBe(true);
    expect(seenPress(true, "idle")).toBe(true);
  });
});
