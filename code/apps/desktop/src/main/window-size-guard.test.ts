import { describe, expect, it } from "vite-plus/test";
import { createSizeGuard } from "./window-size-guard";

const fakeWindow = (size: [number, number], over: { maximized?: boolean; fullScreen?: boolean } = {}) => {
  const w = {
    size,
    scale: 1,
    sets: [] as [number, number][],
    getContentSize: () => w.size,
    setContentSize: (a: number, b: number) => {
      w.sets.push([a, b]);
      w.size = [a, b];
    },
    isMaximized: () => over.maximized ?? false,
    isFullScreen: () => over.fullScreen ?? false,
    scaleFactor: () => w.scale,
  };
  return w;
};

describe("size guard", () => {
  it("puts the size back when a drag onto a monitor with another scale factor changed it", () => {
    const w = fakeWindow([1280, 800]);
    const g = createSizeGuard(w);
    g.willMove();
    w.scale = 1.5;
    w.size = [1536, 960];
    g.moved();
    expect(w.sets).toEqual([[1280, 800]]);
    expect(w.size).toEqual([1280, 800]);
  });

  it("leaves a resize on the same monitor alone, a snap to a screen edge for one", () => {
    const w = fakeWindow([1280, 800]);
    const g = createSizeGuard(w);
    g.willMove();
    w.size = [960, 1040];
    g.moved();
    expect(w.sets).toEqual([]);
  });

  it("does nothing when the scale factor changed but the size is the same", () => {
    const w = fakeWindow([1280, 800]);
    const g = createSizeGuard(w);
    g.willMove();
    w.scale = 2;
    g.moved();
    expect(w.sets).toEqual([]);
  });

  it("keeps the size from the start of the drag when the move events repeat (macOS reports moved while dragging)", () => {
    const w = fakeWindow([1280, 800]);
    const g = createSizeGuard(w);
    g.willMove();
    g.willMove();
    w.scale = 2;
    w.size = [1000, 700];
    g.moved();
    g.moved();
    expect(w.sets).toEqual([[1280, 800]]);
  });

  it("does not touch a window that was never grabbed", () => {
    const w = fakeWindow([1280, 800]);
    const g = createSizeGuard(w);
    w.scale = 2;
    w.size = [900, 700];
    g.moved();
    expect(w.sets).toEqual([]);
  });

  it("leaves a maximized or full-screen window alone", () => {
    for (const over of [{ maximized: true }, { fullScreen: true }]) {
      const w = fakeWindow([1280, 800], over);
      const g = createSizeGuard(w);
      g.willMove();
      w.scale = 2;
      w.size = [1920, 1080];
      g.moved();
      expect(w.sets).toEqual([]);
    }
  });

  it("works again for the next drag", () => {
    const w = fakeWindow([1280, 800]);
    const g = createSizeGuard(w);
    g.willMove();
    w.scale = 2;
    w.size = [1, 1];
    g.moved();
    w.size = [1400, 900];
    g.willMove();
    w.scale = 1;
    w.size = [1, 1];
    g.moved();
    expect(w.sets).toEqual([
      [1280, 800],
      [1400, 900],
    ]);
  });
});
