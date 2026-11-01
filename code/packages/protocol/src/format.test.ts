import { describe, expect, it } from "vite-plus/test";
import { clock, compareNames, plural } from "./format";

describe("clock", () => {
  it.each([
    [0, "0:00"],
    [-5000, "0:00"],
    [65_000, "1:05"],
    [147_000, "2:27"],
    [3_599_000, "59:59"],
    [4_329_000, "1:12:09"],
  ])("%i ms is %s", (ms, text) => expect(clock(ms)).toBe(text));
});

describe("plural", () => {
  it.each([
    [0, "0 pages"],
    [1, "1 page"],
    [2, "2 pages"],
    [11, "11 pages"],
  ])("%i", (n, text) => expect(plural(n, "page", "pages")).toBe(text));
});

describe("compareNames", () => {
  it("orders numbers naturally and ignores case", () => {
    expect(["Voice 10", "voice 2", "Voice 1"].sort(compareNames)).toEqual(["Voice 1", "voice 2", "Voice 10"]);
    expect(compareNames("a", "A")).toBe(0);
  });
});
