import type { NativeImage } from "electron";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createElectronCapturePlatform, stillOf } from "./electron";

type Rect = { x: number; y: number; width: number; height: number };

const mocks = vi.hoisted(() => {
  const state = {
    displays: [] as { id: number; label: string; bounds: { x: number; y: number; width: number; height: number }; scaleFactor: number }[],
    sources: [] as { id: string; name: string; display_id: string; thumbnail: unknown }[],
    access: "granted",
    opened: [] as string[],
    own: [] as string[],
    winBounds: {} as Record<number, { x: number; y: number; width: number; height: number } | undefined>,
    listeners: new Map<string, Set<() => void>>(),
  };
  return { state };
});

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => mocks.state.own.map((id) => ({ getMediaSourceId: () => id })) },
  desktopCapturer: {
    getSources: async (o: { types: string[] }) => mocks.state.sources.filter((s) => s.id.startsWith(o.types[0] === "window" ? "window" : "screen")),
  },
  screen: {
    getAllDisplays: () => mocks.state.displays,
    getCursorScreenPoint: () => ({ x: 5, y: 6 }),
    screenToDipRect: (_w: unknown, r: unknown) => r,
    on: (e: string, fn: () => void) => void (mocks.state.listeners.get(e) ?? mocks.state.listeners.set(e, new Set()).get(e)!).add(fn),
    off: (e: string, fn: () => void) => void mocks.state.listeners.get(e)?.delete(fn),
  },
  shell: { openExternal: async (u: string) => void mocks.state.opened.push(u) },
  systemPreferences: { getMediaAccessStatus: () => mocks.state.access },
}));
vi.mock("../../screen-vision/native", () => ({ loadWindowApi: async () => ({ foreground: () => 0, bounds: (h: number) => mocks.state.winBounds[h] }) }));

interface FakeImage {
  getSize(): { width: number; height: number };
  crop(r: Rect): FakeImage;
  isEmpty(): boolean;
  toPNG(): Buffer;
}
const image = (w: number, h: number, empty = false): FakeImage => ({
  getSize: () => ({ width: w, height: h }),
  isEmpty: () => empty,
  toPNG: () => Buffer.from("png"),
  crop: (r) => image(r.width, r.height),
});

const d1 = { id: 1, label: "Left", bounds: { x: 0, y: 0, width: 1000, height: 800 }, scaleFactor: 2 };
const d2 = { id: 2, label: "", bounds: { x: 1000, y: 0, width: 1000, height: 800 }, scaleFactor: 1 };

beforeEach(() => {
  Object.assign(mocks.state, { displays: [d1, d2], sources: [], access: "granted", opened: [], own: [], winBounds: {} });
  mocks.state.listeners.clear();
});

describe("platform choice", () => {
  it("is Windows and macOS only; anything else says it cannot", async () => {
    const other = createElectronCapturePlatform("linux");
    expect(other).toMatchObject({ os: "other", supported: false, windowPicker: false });
    expect(await other.windows()).toEqual([]);
    expect(await other.resolve({ kind: "screen", displayId: "1" })).toBeUndefined();
  });
  it("lists windows with their rectangles on Windows only", () => {
    expect(createElectronCapturePlatform("win32")).toMatchObject({ os: "win32", supported: true, windowPicker: true });
    expect(createElectronCapturePlatform("darwin")).toMatchObject({ os: "darwin", supported: true, windowPicker: false });
  });
});

describe("screen permission", () => {
  it("is not needed on Windows", () => {
    mocks.state.access = "denied";
    expect(createElectronCapturePlatform("win32").screenPermission()).toBe("not-needed");
  });
  it.each([
    ["granted", "granted"],
    ["not-determined", "not-determined"],
    ["denied", "denied"],
    ["restricted", "denied"],
    ["unknown", "denied"],
  ])("on macOS %s is %s", (status, expected) => {
    mocks.state.access = status;
    expect(createElectronCapturePlatform("darwin").screenPermission()).toBe(expected);
  });
  it("opens the Screen Recording pane on macOS and nothing on Windows", async () => {
    await createElectronCapturePlatform("win32").openScreenSettings();
    expect(mocks.state.opened).toEqual([]);
    await createElectronCapturePlatform("darwin").openScreenSettings();
    expect(mocks.state.opened).toEqual(["x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"]);
  });
});

describe("displays", () => {
  it("names displays and keeps their geometry; an unnamed one gets a number", () => {
    expect(createElectronCapturePlatform("darwin").displays()).toEqual([
      { id: "1", name: "Left", bounds: d1.bounds, scaleFactor: 2 },
      { id: "2", name: "Display 2", bounds: d2.bounds, scaleFactor: 1 },
    ]);
  });
  it("tells when a display is plugged in or out, until it is stopped", () => {
    const p = createElectronCapturePlatform("win32");
    let n = 0;
    const stop = p.onDisplaysChanged(() => void n++);
    for (const fn of mocks.state.listeners.get("display-removed")!) fn();
    for (const fn of mocks.state.listeners.get("display-added")!) fn();
    expect(n).toBe(2);
    stop();
    expect(mocks.state.listeners.get("display-removed")!.size).toBe(0);
  });
});

describe("windows (Windows)", () => {
  const src = (id: string, name: string) => ({ id, name, display_id: "", thumbnail: undefined });
  it("lists other programs' windows with rectangles, without this app's windows, tiny ones and unnamed ones", async () => {
    mocks.state.sources = [src("window:10:0", "Editor"), src("window:11:0", "Self"), src("window:12:0", "Tiny"), src("window:13:0", "  "), src("window:14:0", "Gone")];
    mocks.state.own = ["window:11:0"];
    mocks.state.winBounds = {
      10: { x: 5, y: 5, width: 400, height: 300 },
      11: { x: 0, y: 0, width: 400, height: 300 },
      12: { x: 0, y: 0, width: 8, height: 8 },
      13: { x: 0, y: 0, width: 400, height: 300 },
    };
    expect(await createElectronCapturePlatform("win32").windows()).toEqual([{ id: "window:10:0", title: "Editor", rect: { x: 5, y: 5, width: 400, height: 300 } }]);
  });
  it("lists nothing on macOS", async () => {
    mocks.state.sources = [src("window:10:0", "Editor")];
    expect(await createElectronCapturePlatform("darwin").windows()).toEqual([]);
  });
});

describe("resolve", () => {
  const screens = () => {
    mocks.state.sources = [
      { id: "screen:0:0", name: "s0", display_id: "1", thumbnail: image(2000, 1600) },
      { id: "screen:1:0", name: "s1", display_id: "2", thumbnail: image(1000, 800) },
    ];
  };
  it("points a screen at its capture source", async () => {
    screens();
    expect(await createElectronCapturePlatform("darwin").resolve({ kind: "screen", displayId: "2" })).toEqual({
      sourceId: "screen:1:0",
      title: "Display 2",
      bounds: { x: 1000, y: 0, width: 1000, height: 800 },
    });
  });
  it("cuts an area in the pixels of its display (device scale applied)", async () => {
    screens();
    expect(await createElectronCapturePlatform("win32").resolve({ kind: "area", displayId: "1", rect: { x: 100, y: 50, width: 200, height: 100 } })).toEqual({
      sourceId: "screen:0:0",
      title: "Left · Area",
      crop: { x: 200, y: 100, width: 400, height: 200 },
      bounds: { x: 100, y: 50, width: 200, height: 100 },
    });
  });
  it("is undefined for a display that is gone or has no source", async () => {
    screens();
    const p = createElectronCapturePlatform("win32");
    expect(await p.resolve({ kind: "screen", displayId: "9" })).toBeUndefined();
    mocks.state.sources = [];
    expect(await p.resolve({ kind: "screen", displayId: "1" })).toBeUndefined();
  });
  it("points a window at its own source with its rectangle", async () => {
    mocks.state.sources = [{ id: "window:10:0", name: "Editor", display_id: "", thumbnail: undefined }];
    mocks.state.winBounds = { 10: { x: 5, y: 5, width: 400, height: 300 } };
    expect(await createElectronCapturePlatform("win32").resolve({ kind: "window", windowId: "window:10:0", title: "Editor" })).toEqual({
      sourceId: "window:10:0",
      title: "Editor",
      windowRect: { x: 5, y: 5, width: 400, height: 300 },
      bounds: { x: 5, y: 5, width: 400, height: 300 },
    });
  });
});

describe("still", () => {
  it("takes the whole display, or the area cut at the display's own resolution", async () => {
    mocks.state.sources = [{ id: "screen:0:0", name: "s0", display_id: "1", thumbnail: image(2000, 1600) }];
    const p = createElectronCapturePlatform("win32");
    expect(await p.still({ kind: "screen", displayId: "1" })).toEqual({ png: Buffer.from("png"), width: 2000, height: 1600 });
    expect(await p.still({ kind: "area", displayId: "1", rect: { x: 10, y: 10, width: 100, height: 50 } })).toMatchObject({ width: 200, height: 100 });
  });
  it("is undefined for an empty picture, a missing source and an unknown display", async () => {
    const p = createElectronCapturePlatform("win32");
    mocks.state.sources = [{ id: "screen:0:0", name: "s0", display_id: "1", thumbnail: image(10, 10, true) }];
    expect(await p.still({ kind: "screen", displayId: "1" })).toBeUndefined();
    mocks.state.sources = [];
    expect(await p.still({ kind: "screen", displayId: "1" })).toBeUndefined();
    expect(await p.still({ kind: "screen", displayId: "9" })).toBeUndefined();
  });
});

describe("stillOf", () => {
  const pic = (w = 1000, h = 800) => image(w, h) as unknown as NativeImage;
  it("returns the whole picture when there is no area", () => {
    const p = pic();
    expect(stillOf(p, undefined)).toBe(p);
  });
  it("cuts the area", () => {
    expect(stillOf(pic(), { x: 10, y: 20, width: 100, height: 50 }).getSize()).toEqual({ width: 100, height: 50 });
  });
  it("keeps a window that sticks out of the screen inside the picture", () => {
    expect(stillOf(pic(), { x: -50, y: 700, width: 200, height: 300 }).getSize()).toEqual({ width: 150, height: 100 });
    expect(stillOf(pic(), { x: 900, y: -20, width: 400, height: 100 }).getSize()).toEqual({ width: 100, height: 80 });
  });
  it("returns the whole picture when the area is off the picture or empty", () => {
    const p = pic();
    expect(stillOf(p, { x: 5000, y: 0, width: 10, height: 10 })).toBe(p);
    expect(stillOf(p, { x: 0, y: 0, width: 0, height: 10 })).toBe(p);
  });
});
