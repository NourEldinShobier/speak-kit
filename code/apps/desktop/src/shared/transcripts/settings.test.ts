import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { policyOf, TranscriptsPatchSchema } from "./settings";

describe("transcripts settings", () => {
  it("a config from before transcripts existed gets the defaults", () => {
    expect(parseConfig({ setupDone: true }).transcripts).toEqual({ textDays: 30, keepAudio: true, audioDays: 7, trashDays: 30, folder: "", language: "auto" });
  });

  it("a bad field falls back to its own default and keeps the good ones", () => {
    const c = parseConfig({ transcripts: { textDays: 45, keepAudio: "yes", audioDays: 14, trashDays: 90, folder: 5, language: "fr" } });
    expect(c.transcripts).toEqual({ textDays: 30, keepAudio: true, audioDays: 14, trashDays: 90, folder: "", language: "auto" });
  });

  it("a settings value that is not an object is replaced by the defaults", () => {
    expect(parseConfig({ transcripts: "oops" }).transcripts.textDays).toBe(30);
  });

  it("the retention rules: forever text is null days, the audio cap is fixed", () => {
    const base = parseConfig({}).transcripts;
    expect(policyOf(base)).toEqual({ textDays: 30, audioDays: 7, audioCapBytes: 5368709120, trashDays: 30, keepAudio: true });
    expect(policyOf({ ...base, textDays: 0, keepAudio: false })).toMatchObject({ textDays: null, keepAudio: false });
  });

  it("the window may change retention and language, not the folder", () => {
    expect(v.safeParse(TranscriptsPatchSchema, { textDays: 90, keepAudio: false, audioDays: 3, trashDays: 7, language: "de" }).success).toBe(true);
    expect(v.safeParse(TranscriptsPatchSchema, { folder: "C:\\x" }).success).toBe(false);
    expect(v.safeParse(TranscriptsPatchSchema, { textDays: 12 }).success).toBe(false);
  });
});
