import { describe, expect, it } from "vite-plus/test";
import { Consent } from "./consent";

describe("Consent", () => {
  it("remembers a granted session and nothing else", () => {
    const c = new Consent();
    expect(c.has("a")).toBe(false);
    c.grant("a");
    expect([c.has("a"), c.has("b")]).toEqual([true, false]);
  });

  it("expires after the time to live", () => {
    let now = 0;
    const c = new Consent(1000, () => now);
    c.grant("a");
    now = 999;
    expect(c.has("a")).toBe(true);
    now = 1000;
    expect(c.has("a")).toBe(false);
  });

  it("granting again starts the time again", () => {
    let now = 0;
    const c = new Consent(1000, () => now);
    c.grant("a");
    now = 900;
    c.grant("a");
    now = 1500;
    expect(c.has("a")).toBe(true);
  });

  it("keeps the newest 32 sessions", () => {
    const c = new Consent();
    for (let i = 0; i < 33; i++) c.grant(`s${i}`);
    expect([c.has("s0"), c.has("s1"), c.has("s32")]).toEqual([false, true, true]);
  });

  it("revokes one session or all", () => {
    const c = new Consent();
    c.grant("a");
    c.grant("b");
    c.revoke("a");
    expect([c.has("a"), c.has("b")]).toEqual([false, true]);
    c.revoke();
    expect(c.has("b")).toBe(false);
  });
});
