import { describe, expect, it } from "vite-plus/test";
import { SingleSession } from "./single";

describe("SingleSession", () => {
  it("starting in a second tab evicts the first; the same tab again evicts nobody", () => {
    const s = new SingleSession();
    expect(s.claim(1)).toBeUndefined();
    expect(s.claim(1)).toBeUndefined();
    expect(s.claim(2)).toBe(1);
    expect(s.tab).toBe(2);
  });

  it("only the owner can release", () => {
    const s = new SingleSession();
    s.claim(2);
    expect(s.release(1)).toBe(false);
    expect(s.tab).toBe(2);
    expect(s.release(2)).toBe(true);
    expect(s.tab).toBeUndefined();
  });
});
