import { describe, expect, it } from "vite-plus/test";
import { CHURN_MIN, mayHaveChangedContent, pageChanged, type Mutation } from "./churn";

const div = { nodeName: "DIV", textContent: "" };
const added = (nodeName: string, text: string, nodeType = 1): Mutation => ({ type: "childList", target: div, addedNodes: [{ nodeType, nodeName, textContent: text }] });
const text = (textContent: string): Mutation => ({ type: "characterData", target: { nodeName: "#text", textContent, parentElement: null }, addedNodes: [] });

describe("mayHaveChangedContent", () => {
  it("a clock that ticks every second is not a change", () => {
    expect(mayHaveChangedContent([text("12:03:44")])).toBe(false);
    expect(mayHaveChangedContent([added("SPAN", "12:03:45")])).toBe(false);
  });

  it("scripts, styles, templates, noscript and comments are not content, however long", () => {
    const big = "x".repeat(5000);
    for (const name of ["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]) expect(mayHaveChangedContent([added(name, big)])).toBe(false);
    expect(mayHaveChangedContent([added("#comment", big, 8)])).toBe(false);
    expect(mayHaveChangedContent([{ type: "characterData", target: { nodeName: "#text", textContent: big, parentElement: { closest: () => ({}) } }, addedNodes: [] }])).toBe(false);
  });

  it("an article that arrives is one", () => {
    expect(mayHaveChangedContent([added("ARTICLE", "The harbor wakes before the first ferry. ".repeat(60))])).toBe(true);
    expect(mayHaveChangedContent([text("A paragraph that was rewritten in place, long enough to be real prose and not a counter. ".repeat(3))])).toBe(true);
  });
});

describe("pageChanged", () => {
  it("compares the length of the main text: a clock moves it by a few characters, an article swap by thousands", () => {
    expect(pageChanged(4000, 4000 + 8)).toBe(false); // the clock text grew by a digit
    expect(pageChanged(4000, 4000 + CHURN_MIN)).toBe(false);
    expect(pageChanged(4000, 4000 + CHURN_MIN + 1)).toBe(true);
    expect(pageChanged(4000, 100)).toBe(true); // a different, much shorter article
  });

  it("a long page needs a quarter of its length to change", () => {
    expect(pageChanged(40_000, 49_000)).toBe(false);
    expect(pageChanged(40_000, 50_001)).toBe(true);
  });
});
