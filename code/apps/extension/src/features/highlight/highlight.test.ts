import { describe, expect, it } from "vite-plus/test";
import { DARK_PAGE_HL, highlightCss, palette } from "./highlight";

describe("highlightCss", () => {
  const css = highlightCss({ sentence: "#FFF1C2", word: "#FFD24D", wordText: "#1E1F20" });

  it("underlines the sentence (1px) and the spoken word (2px) so colour is not the only cue", () => {
    expect(css).toContain("::highlight(speakkit-sentence){background-color:#FFF1C2;color:inherit;text-decoration:underline 1px}");
    expect(css).toContain("::highlight(speakkit-word){background-color:#FFD24D;color:#1E1F20;text-decoration:underline 2px}");
  });

  it("never pads or changes the weight of the text", () => {
    expect(css).not.toMatch(/padding|font-weight|margin/);
  });

  it("uses the dark-page palette when the page is dark and matching is on", () => {
    const h = { mode: "sentence+word", sentenceColor: "#FFF1C2", wordColor: "#FFD24D", matchTheme: true } as const;
    expect(palette(h, true)).toEqual({ sentence: "#78621F", word: "#f2c04e", wordText: "#1e1f20" });
    expect(DARK_PAGE_HL.word).toBe("#f2c04e");
    expect(palette(h, false).word).toBe("#FFD24D");
  });
});
