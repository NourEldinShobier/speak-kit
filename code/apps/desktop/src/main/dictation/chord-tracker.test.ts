import { describe, expect, it } from "vite-plus/test";
import { createChordTracker } from "./chord-tracker";
import { VK } from "./types";

const down = (vk: number) => ({ vk, down: true });
const up = (vk: number) => ({ vk, down: false });
const A = 0x41;

describe("single-key chord (Right Ctrl)", () => {
  it("swallows the press and the release, and reports down then up", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    expect(t.feed(down(VK.rightCtrl))).toEqual({ swallow: true, events: [{ kind: "down" }] });
    expect(t.feed(up(VK.rightCtrl))).toEqual({ swallow: true, events: [{ kind: "up" }] });
  });

  it("swallows key repeat without new events", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(down(VK.rightCtrl));
    expect(t.feed(down(VK.rightCtrl))).toEqual({ swallow: true, events: [] });
    expect(t.feed(down(VK.rightCtrl))).toEqual({ swallow: true, events: [] });
  });

  it("does not touch other keys while idle", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    expect(t.feed(down(A))).toEqual({ swallow: false, events: [] });
    expect(t.feed(up(A))).toEqual({ swallow: false, events: [] });
    expect(t.feed(down(VK.leftCtrl))).toEqual({ swallow: false, events: [] });
  });

  it("reports another key pressed during the hold once, and lets the app have it", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(down(VK.rightCtrl));
    expect(t.feed(down(A))).toEqual({ swallow: false, events: [{ kind: "other", vk: A }] });
    expect(t.feed(down(A))).toEqual({ swallow: false, events: [] });
    expect(t.feed(up(A))).toEqual({ swallow: false, events: [] });
  });
});

describe("two-key chord (Left Ctrl + Space)", () => {
  const chord = { keys: [VK.leftCtrl, VK.space] };

  it("lets Ctrl through and swallows only Space, the key that completed the chord", () => {
    const t = createChordTracker(chord);
    expect(t.feed(down(VK.leftCtrl))).toEqual({ swallow: false, events: [] });
    expect(t.feed(down(VK.space))).toEqual({ swallow: true, events: [{ kind: "down" }] });
    expect(t.feed(up(VK.space))).toEqual({ swallow: true, events: [{ kind: "up" }] });
    expect(t.feed(up(VK.leftCtrl))).toEqual({ swallow: false, events: [] });
  });

  it("does not trigger on Space alone", () => {
    const t = createChordTracker(chord);
    expect(t.feed(down(VK.space))).toEqual({ swallow: false, events: [] });
    expect(t.feed(up(VK.space))).toEqual({ swallow: false, events: [] });
  });

  it("releasing Ctrl first reports up once and still swallows the later Space release", () => {
    const t = createChordTracker(chord);
    t.feed(down(VK.leftCtrl));
    t.feed(down(VK.space));
    expect(t.feed(up(VK.leftCtrl))).toEqual({ swallow: false, events: [{ kind: "up" }] });
    expect(t.feed(up(VK.space))).toEqual({ swallow: true, events: [] });
  });

  it("can be triggered again after a release", () => {
    const t = createChordTracker(chord);
    t.feed(down(VK.leftCtrl));
    t.feed(down(VK.space));
    t.feed(up(VK.space));
    expect(t.feed(down(VK.space))).toEqual({ swallow: true, events: [{ kind: "down" }] });
  });
});

describe("grabbed keys", () => {
  it("swallows a grabbed key and its release and reports it, until released from the list", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.grab([VK.escape]);
    expect(t.feed(down(VK.escape))).toEqual({ swallow: true, events: [{ kind: "grabbed", vk: VK.escape }] });
    expect(t.feed(up(VK.escape))).toEqual({ swallow: true, events: [] });
    t.grab([]);
    expect(t.feed(down(VK.escape))).toEqual({ swallow: false, events: [] });
  });

  it("lets the release of a key through when it went down before it was grabbed", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(down(VK.escape));
    t.grab([VK.escape]);
    expect(t.feed(up(VK.escape))).toEqual({ swallow: false, events: [] });
  });
});

describe("stuck keys", () => {
  it("reset forgets held keys and reports up when the chord was down", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(down(VK.rightCtrl));
    expect(t.reset()).toEqual([{ kind: "up" }]);
    expect(t.reset()).toEqual([]);
    expect(t.feed(down(VK.rightCtrl))).toEqual({ swallow: true, events: [{ kind: "down" }] });
  });

  it("offers only keys the app saw go down for the keyboard-state check", () => {
    const t = createChordTracker({ keys: [VK.leftCtrl, VK.space] });
    t.feed(down(VK.leftCtrl));
    expect(t.visibleHeld()).toEqual([VK.leftCtrl]);
    t.feed(down(VK.space));
    expect(t.visibleHeld()).toEqual([VK.leftCtrl]);
  });

  it("reports up for a key found released without a release stroke, once", () => {
    const t = createChordTracker({ keys: [VK.leftCtrl, VK.space] });
    t.feed(down(VK.leftCtrl));
    t.feed(down(VK.space));
    expect(t.release(VK.leftCtrl)).toEqual([{ kind: "up" }]);
    expect(t.release(VK.leftCtrl)).toEqual([]);
    expect(t.active).toBe(false);
  });
});
