import { describe, expect, it } from "vite-plus/test";
import type { ReaderSentence } from "./model";
import { wordSpanIn } from "./useHighlights";

const second: ReaderSentence = { text: "Here is the second one.", block: 1, start: 39, end: 62 };

describe("wordSpanIn", () => {
  it("places a word of the sentence in its block", () => {
    expect(wordSpanIn(second, { start: 5, end: 7 })).toEqual({ block: 1, start: 44, end: 46 });
  });

  it("drops the word of the previous sentence that is still in state for one frame, because it ends beyond this sentence", () => {
    expect(wordSpanIn(second, { start: 28, end: 37 })).toBeNull();
  });

  it("drops a missing word", () => {
    expect(wordSpanIn(second, undefined)).toBeNull();
  });
});
