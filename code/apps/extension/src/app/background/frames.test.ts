import { describe, expect, it } from "vite-plus/test";
import type { ReadDoc } from "@speakkit/protocol";
import { pickFrame } from "./frames";

const doc = (text: string, source: ReadDoc["source"] = "page"): ReadDoc => ({
  docId: text,
  tabId: -1,
  url: "https://a.example/",
  title: "",
  sentences: text ? [{ text, block: 0 }] : [],
  startIndex: 0,
  source,
});
const reply = (frameId: number, text: string, source: ReadDoc["source"] = "page") => ({ frameId, reply: { doc: doc(text, source) } });

describe("pickFrame", () => {
  it("takes the frame with the most readable text", () => {
    expect(pickFrame([reply(0, "short shell"), reply(7, "the whole article is in this frame"), reply(9, "an ad")])?.frameId).toBe(7);
  });

  it("keeps the top frame on a tie", () => {
    expect(pickFrame([reply(0, "same text"), reply(7, "same text")])?.frameId).toBe(0);
  });

  it("prefers a selection over a longer page", () => {
    expect(pickFrame([reply(0, "a very long page of text", "page"), reply(7, "picked", "selection")])?.frameId).toBe(7);
  });

  it("skips frames that answered nothing or had no text, and returns the top error when none has text", () => {
    expect(pickFrame([{ frameId: 0, reply: { error: "page-unreadable" as const } }, { frameId: 3, reply: undefined }, reply(4, "")])).toEqual({
      frameId: 0,
      reply: { error: "page-unreadable" },
    });
    expect(
      pickFrame([
        { frameId: 0, reply: undefined },
        { frameId: 3, reply: undefined },
      ]),
    ).toBeUndefined();
  });
});
