import { describe, expect, it } from "vite-plus/test";
import { Consent } from "./consent";

describe("Consent", () => {
  it("remembers a granted session and nothing else", () => {
    const c = new Consent();
    expect(c.has("a", "window")).toBe(false);
    c.grant("a", "window");
    expect([c.has("a", "window"), c.has("b", "window")]).toEqual([true, false]);
  });

  it("a window consent does not cover the whole screen", () => {
    const c = new Consent();
    c.grant("a", "window");
    expect([c.has("a", "window"), c.has("a", "screen")]).toEqual([true, false]);
  });

  it("a screen consent covers the window as well", () => {
    const c = new Consent();
    c.grant("a", "screen");
    expect([c.has("a", "window"), c.has("a", "screen")]).toEqual([true, true]);
  });

  it("granting the screen keeps the window consent, and granting the window keeps the screen consent", () => {
    const c = new Consent();
    c.grant("a", "window");
    c.grant("a", "screen");
    c.grant("a", "window");
    expect([c.has("a", "window"), c.has("a", "screen")]).toEqual([true, true]);
  });

  it("expires after the time to live", () => {
    let now = 0;
    const c = new Consent(1000, () => now);
    c.grant("a", "screen");
    now = 999;
    expect(c.has("a", "screen")).toBe(true);
    now = 1000;
    expect([c.has("a", "screen"), c.has("a", "window")]).toEqual([false, false]);
  });

  it("each scope has its own time", () => {
    let now = 0;
    const c = new Consent(1000, () => now);
    c.grant("a", "screen");
    now = 600;
    c.grant("a", "window");
    now = 1200;
    expect([c.has("a", "window"), c.has("a", "screen")]).toEqual([true, false]);
  });

  it("granting again starts the time again", () => {
    let now = 0;
    const c = new Consent(1000, () => now);
    c.grant("a", "window");
    now = 900;
    c.grant("a", "window");
    now = 1500;
    expect(c.has("a", "window")).toBe(true);
  });

  it("keeps the newest 32 sessions", () => {
    const c = new Consent();
    for (let i = 0; i < 33; i++) c.grant(`s${i}`, "window");
    expect([c.has("s0", "window"), c.has("s1", "window"), c.has("s32", "window")]).toEqual([false, true, true]);
  });

  it("revokes one session or all", () => {
    const c = new Consent();
    c.grant("a", "screen");
    c.grant("b", "window");
    c.revoke("a");
    expect([c.has("a", "screen"), c.has("b", "window")]).toEqual([false, true]);
    c.revoke();
    expect(c.has("b", "window")).toBe(false);
  });
});
