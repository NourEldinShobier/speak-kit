import { tokens } from "@speakkit/ui/tokens";
import { expect, test } from "vite-plus/test";
import { DARK_PAGE_WORD, WORD_TEXT } from "./colors";

test("the colours the content script carries as literals still equal their design tokens", () => {
  expect(WORD_TEXT).toBe(tokens.dark["text-on-highlight"]);
  expect(WORD_TEXT).toBe(tokens.light["text-on-highlight"]);
  expect(DARK_PAGE_WORD).toBe(tokens.dark["tag-yellow"]);
});
