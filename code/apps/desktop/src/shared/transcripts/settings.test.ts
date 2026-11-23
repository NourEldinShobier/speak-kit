import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";
import { parseConfig } from "../schemas";
import { TranscriptsPatchSchema } from "./settings";

describe("transcripts settings", () => {
  it("a config from before transcripts existed gets the defaults", () => {
    expect(parseConfig({ setupDone: true }).transcripts).toEqual({ language: "auto", notes: false });
  });

  it("a bad field falls back to its own default and keeps the good ones", () => {
    expect(parseConfig({ transcripts: { language: "fr", notes: true } }).transcripts).toEqual({ language: "auto", notes: true });
    expect(parseConfig({ transcripts: { language: "de", notes: 1 } }).transcripts).toEqual({ language: "de", notes: false });
  });

  it("a settings value that is not an object is replaced by the defaults", () => {
    expect(parseConfig({ transcripts: "oops" }).transcripts).toEqual({ language: "auto", notes: false });
  });

  it("keys of removed settings (retention, Trash, folder) load without error and are dropped", () => {
    const stored = { textDays: 90, keepAudio: false, audioDays: 14, trashDays: 7, folder: "D:/Talks", language: "de", notes: true };
    expect(parseConfig({ transcripts: stored }).transcripts).toEqual({ language: "de", notes: true });
  });

  it("the window may change the language and the notes, nothing else", () => {
    expect(v.safeParse(TranscriptsPatchSchema, { language: "de", notes: true }).success).toBe(true);
    for (const key of ["textDays", "keepAudio", "audioDays", "trashDays", "folder"]) expect(v.safeParse(TranscriptsPatchSchema, { [key]: 1 }).success).toBe(false);
  });
});
