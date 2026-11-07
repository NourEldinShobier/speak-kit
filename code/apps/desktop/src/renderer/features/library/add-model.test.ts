import { describe, expect, it } from "vite-plus/test";
import { countWords, initPaste, initUrl, pasteReducer, urlReducer } from "./add-model";

describe("countWords", () => {
  it.each([
    ["", 0],
    ["   \n ", 0],
    ["one", 1],
    ["two  words\nand three", 4],
  ])("%j has %i words", (text, n) => {
    expect(countWords(text)).toBe(n);
  });
});

describe("pasteReducer", () => {
  it("keeps what is typed and the chosen voice", () => {
    const s = [
      { type: "text", text: "Hello there" },
      { type: "title", title: "Greeting" },
      { type: "voice", voice: "bf_emma" },
    ] as const;
    expect(s.reduce(pasteReducer, initPaste("af_heart"))).toEqual({ text: "Hello there", title: "Greeting", voice: "bf_emma", error: null });
  });

  it("shows an error, and clears text, title and error after the text is added (the voice stays)", () => {
    let s = pasteReducer(pasteReducer(initPaste("af_heart"), { type: "text", text: "x" }), { type: "failed", message: "Too long" });
    expect(s.error).toBe("Too long");
    s = pasteReducer(s, { type: "added" });
    expect(s).toEqual({ text: "", title: "", voice: "af_heart", error: null });
  });
});

describe("urlReducer", () => {
  it("goes idle, fetching, failed with the reason, and clears the address when added", () => {
    let s = urlReducer(initUrl(), { type: "url", url: "https://example.com/a" });
    s = urlReducer(s, { type: "fetch" });
    expect(s.phase).toEqual({ kind: "fetching" });
    s = urlReducer(s, { type: "failed", message: "HTTP 403" });
    expect(s.phase).toEqual({ kind: "failed", message: "HTTP 403" });
    expect(urlReducer(s, { type: "added" })).toEqual({ url: "", phase: { kind: "idle" }, details: false });
  });

  it("toggles the details", () => {
    expect(urlReducer(urlReducer(initUrl(), { type: "toggle-details" }), { type: "toggle-details" }).details).toBe(false);
    expect(urlReducer(initUrl(), { type: "toggle-details" }).details).toBe(true);
  });
});
