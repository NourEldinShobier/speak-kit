import { describe, expect, it } from "vite-plus/test";
import { clock } from "./format";

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
