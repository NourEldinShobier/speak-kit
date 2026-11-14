import { describe, expect, it } from "vitest";
import { coverFile, lookOfCapture, MAX_TEXT } from "./look";

const pic = { base64: "QUJD", width: 1280, height: 720 };
const word = (text: string) => ({ text, startMs: 0, endMs: 1 });

describe("capture look", () => {
  it("is the contact sheet of a recording and the screenshot, preferring an edited copy", () => {
    expect(coverFile({ kind: "recording", media: "video.webm", sheet: "sheet.jpg" })).toBe("sheet.jpg");
    expect(coverFile({ kind: "recording", media: "video.webm" })).toBeUndefined();
    expect(coverFile({ kind: "screenshot", media: "shot.png" })).toBe("shot.png");
    expect(coverFile({ kind: "screenshot", media: "shot.png", edits: { "shot.png": "edit-shot.png" } })).toBe("edit-shot.png");
  });

  it("carries the words in order and marks itself as a capture", () => {
    expect(lookOfCapture({ title: "Screen", words: [word("this"), word("one")] }, pic)).toEqual({
      image: "QUJD",
      width: 1280,
      height: 720,
      text: "this one",
      ocr: "ok",
      target: "Screen",
      scope: "capture",
    });
  });

  it("adds the controls that were on screen after the words, or alone when nothing was said", () => {
    expect(lookOfCapture({ title: "Screen", words: [word("this")], context: "button: Save" }, pic).text).toBe("this\n\nControls on screen when the recording ended:\nbutton: Save");
    expect(lookOfCapture({ title: "Screen", context: "button: Save" }, pic)).toMatchObject({ text: "Controls on screen when the recording ended:\nbutton: Save", ocr: "ok" });
  });

  it("says empty when nothing was said", () => {
    expect(lookOfCapture({ title: "Screen" }, pic)).toMatchObject({ text: "", ocr: "empty" });
    expect(lookOfCapture({ title: "Screen", words: [] }, pic)).toMatchObject({ ocr: "empty" });
  });

  it("cuts a very long narration and a very long title", () => {
    const look = lookOfCapture({ title: "t".repeat(300), words: [word("w".repeat(MAX_TEXT + 50))] }, pic);
    expect(look.text).toHaveLength(MAX_TEXT);
    expect(look.target).toHaveLength(120);
  });
});
