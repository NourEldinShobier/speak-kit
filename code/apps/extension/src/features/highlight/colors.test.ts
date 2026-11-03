import { tokens } from "@speakkit/ui/tokens";
import { expect, test } from "vite-plus/test";
import { DARK_PAGE_WORD, WORD_TEXT } from "./colors";

test("the word text colour equals its design token, and the dark-host-page word colour is the fixed amber", () => {
  expect(WORD_TEXT).toBe(tokens.light["text-on-highlight"]);
  expect(DARK_PAGE_WORD).toBe("#f2c04e");
});
