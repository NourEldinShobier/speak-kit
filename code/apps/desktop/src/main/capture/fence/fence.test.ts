import { describe, expect, it } from "vitest";
import { createFence } from ".";

describe("generation fence", () => {
  it("accepts only the open generation", () => {
    const f = createFence();
    expect(f.accepts(0)).toBe(false);
    const g = f.open();
    expect(g).toBe(1);
    expect(f.accepts(1)).toBe(true);
    expect(f.accepts(2)).toBe(false);
  });

  it("refuses data of a discarded recording after a new one opened", () => {
    const f = createFence();
    const old = f.open();
    f.close();
    const fresh = f.open();
    expect(f.accepts(old)).toBe(false);
    expect(f.accepts(fresh)).toBe(true);
  });

  it("refuses everything while closed, even the last generation", () => {
    const f = createFence();
    const g = f.open();
    f.close();
    expect(f.accepts(g)).toBe(false);
  });

  it("counts refused items", () => {
    const f = createFence();
    f.refuse();
    f.refuse();
    expect(f.refused).toBe(2);
  });
});
