import { describe, expect, it } from "vite-plus/test";
import type { CapsuleView } from "../../shared/meetings/contract";
import { Capsule, CAPSULE_SIZE, type CapsuleWindow } from "./capsule";
import { displayAt, monitorKey, offsetOf, place, type DisplayInfo } from "./placement";

const main: DisplayInfo = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const side: DisplayInfo = { id: 2, workArea: { x: 1920, y: 0, width: 1280, height: 1000 } };

describe("placement", () => {
  it("puts the capsule in the top-right corner of a monitor by default", () => {
    expect(place(main, {}, CAPSULE_SIZE)).toEqual({ x: 1920 - 520 - 24, y: 24, key: "1:1920x1040" });
  });

  it("uses the saved place on this monitor, kept fully on it", () => {
    expect(place(side, { [monitorKey(side)]: { x: 100, y: 200 } }, CAPSULE_SIZE)).toEqual({ x: 2020, y: 200, key: "2:1280x1000" });
    expect(place(side, { [monitorKey(side)]: { x: 5000, y: 5000 } }, CAPSULE_SIZE)).toEqual({ x: 1920 + 1280 - 520, y: 1000 - 132, key: "2:1280x1000" });
    expect(place(side, { [monitorKey(side)]: { x: -50, y: -9 } }, CAPSULE_SIZE)).toMatchObject({ x: 1920, y: 0 });
  });

  it("does not give a monitor the place saved for another size on the same id", () => {
    const resized: DisplayInfo = { id: 2, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } };
    expect(place(resized, { [monitorKey(side)]: { x: 0, y: 0 } }, CAPSULE_SIZE)).toMatchObject({ x: 1920 + 1920 - 520 - 24, y: 24 });
  });

  it("finds the monitor a point is on, else the first", () => {
    expect(displayAt([main, side], { x: 2000, y: 10 })).toBe(side);
    expect(displayAt([main, side], { x: -5, y: 10 })).toBe(main);
    expect(displayAt([], { x: 0, y: 0 })).toBeUndefined();
    expect(offsetOf(side, { x: 2020, y: 200 })).toEqual({ x: 100, y: 200 });
  });
});

function fake() {
  const wins: Win[] = [];
  const saved: Record<string, { x: number; y: number }> = {};
  let displays = [main, side];
  let cursor = { x: 10, y: 10 };
  const cap = new Capsule({
    open: () => {
      const w = new Win();
      wins.push(w);
      return w;
    },
    displays: () => displays,
    cursor: () => cursor,
    saved: () => saved,
    save: (p) => Object.assign(saved, p),
  });
  return { cap, wins, saved, setDisplays: (d: DisplayInfo[]) => (displays = d), setCursor: (c: { x: number; y: number }) => (cursor = c) };
}

class Win implements CapsuleWindow {
  at = { x: 0, y: 0 };
  through = false;
  shown = false;
  sent: (CapsuleView | null)[] = [];
  destroyed = false;
  setPosition(x: number, y: number) {
    this.at = { x, y };
  }
  position() {
    return this.at;
  }
  setClickThrough(on: boolean) {
    this.through = on;
  }
  send(v: CapsuleView | null) {
    this.sent.push(v);
  }
  show() {
    this.shown = true;
  }
  hide() {
    this.shown = false;
  }
  destroy() {
    this.destroyed = true;
  }
}

const offer: CapsuleView = { kind: "offer", sessionId: "s", app: "Zoom" };

describe("capsule", () => {
  it("opens click-through on the monitor the pointer is on and shows the view", () => {
    const f = fake();
    f.setCursor({ x: 2500, y: 100 });
    f.cap.show(offer);
    expect(f.wins).toHaveLength(1);
    expect(f.wins[0]).toMatchObject({ through: true, shown: true, sent: [offer], at: { x: 1920 + 1280 - 520 - 24, y: 24 } });
  });

  it("takes clicks only while the pointer is on the pill", () => {
    const f = fake();
    f.cap.show(offer);
    f.cap.interactive(true);
    expect(f.wins[0]!.through).toBe(false);
    f.cap.interactive(false);
    expect(f.wins[0]!.through).toBe(true);
  });

  it("hides when told to show nothing and keeps the window for the next call", () => {
    const f = fake();
    f.cap.show(offer);
    f.cap.show(null);
    expect(f.wins[0]).toMatchObject({ shown: false });
    f.cap.show(offer);
    expect(f.wins).toHaveLength(1);
  });

  it("follows a drag and remembers where it was dropped, per monitor", () => {
    const f = fake();
    f.cap.show(offer);
    f.cap.drag(-100, 50, false);
    f.cap.drag(0, 0, true);
    expect(f.wins[0]!.at).toEqual({ x: 1276, y: 74 });
    expect(f.saved).toEqual({ "1:1920x1040": { x: 1276, y: 74 } });
  });

  it("moves to the other monitor when dropped there and keeps it fully on that monitor", () => {
    const f = fake();
    f.cap.show(offer);
    f.cap.drag(700, 0, false);
    f.cap.drag(700, 900, true);
    expect(f.saved["2:1280x1000"]).toBeDefined();
    expect(f.wins[0]!.at.y).toBe(1000 - 132);
    expect(f.wins[0]!.at.x).toBeGreaterThanOrEqual(1920);
  });

  it("ignores a drag when no window exists", () => {
    const f = fake();
    f.cap.drag(5, 5, true);
    expect(f.saved).toEqual({});
  });

  it("goes back to the primary monitor when the one it was on is unplugged", () => {
    const f = fake();
    f.setCursor({ x: 2500, y: 100 });
    f.cap.show(offer);
    f.setDisplays([main]);
    f.cap.displaysChanged();
    expect(f.wins[0]!.at).toEqual({ x: 1376, y: 24 });
    expect(f.wins[0]!.sent.at(-1)).toEqual(offer);
  });

  it("makes the window again when it was destroyed under it", () => {
    const f = fake();
    f.cap.show(offer);
    f.wins[0]!.destroyed = true;
    f.cap.displaysChanged();
    expect(f.wins).toHaveLength(2);
    expect(f.wins[1]!).toMatchObject({ shown: true, through: true });
  });

  it("does nothing on a monitor change while nothing is shown", () => {
    const f = fake();
    f.cap.displaysChanged();
    expect(f.wins).toHaveLength(0);
  });

  it("is placed again on a monitor plugged in, at its saved place there", () => {
    const f = fake();
    f.setDisplays([main]);
    f.cap.show(offer);
    f.setDisplays([main, side]);
    f.cap.displaysChanged();
    expect(f.wins[0]!.at).toEqual({ x: 1376, y: 24 });
  });
});
