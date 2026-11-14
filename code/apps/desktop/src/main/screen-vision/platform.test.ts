import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  access: "granted",
  sources: [] as { display_id: string; thumbnail: { isEmpty(): boolean; getSize(): { width: number; height: number } } }[],
  asked: [] as unknown[],
  protectedCalls: [] as boolean[],
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, setContentProtection: (on: boolean) => state.protectedCalls.push(on) }] },
  desktopCapturer: {
    getSources: async (o: unknown) => {
      state.asked.push(o);
      return state.sources;
    },
  },
  screen: {
    getAllDisplays: () => [{ id: 7, bounds: { x: 0, y: 0, width: 1440, height: 900 }, scaleFactor: 2 }],
    getCursorScreenPoint: () => ({ x: 10, y: 20 }),
  },
  systemPreferences: { getMediaAccessStatus: () => state.access },
}));

import { createMacPlatform } from "./platform";

const picture = (empty = false) => ({ isEmpty: () => empty, getSize: () => ({ width: 2880, height: 1800 }) });

beforeEach(() => {
  state.access = "granted";
  state.sources = [{ display_id: "7", thumbnail: picture() }];
  state.asked = [];
  state.protectedCalls = [];
});

describe("macOS screen platform", () => {
  it("lists displays and the cursor in screen points, and has no window list", async () => {
    const p = createMacPlatform();
    expect(p.supported).toBe(true);
    expect(p.displays()).toEqual([{ id: "7", bounds: { x: 0, y: 0, width: 1440, height: 900 } }]);
    expect(p.cursor()).toEqual({ x: 10, y: 20 });
    expect(await p.windows()).toEqual([]);
    expect(p.foreground()).toBeUndefined();
  });

  it("captures at the display's native resolution", async () => {
    const shot = await createMacPlatform().grab(createMacPlatform().displays()[0]!);
    expect(state.asked).toEqual([{ types: ["screen"], thumbnailSize: { width: 2880, height: 1800 } }]);
    expect(shot.width).toBe(2880);
  });

  it("fails when Screen Recording is denied or restricted, before asking for a picture", async () => {
    const p = createMacPlatform();
    for (const access of ["denied", "restricted"]) {
      state.access = access;
      await expect(p.grab(p.displays()[0]!)).rejects.toThrow("not allowed");
    }
    expect(state.asked).toEqual([]);
  });

  it("fails for an empty picture or a missing display, and hides its own windows only while the capture runs", async () => {
    const p = createMacPlatform();
    state.sources = [{ display_id: "7", thumbnail: picture(true) }];
    await expect(p.grab(p.displays()[0]!)).rejects.toThrow("no picture");
    state.sources = [];
    await expect(p.grab(p.displays()[0]!)).rejects.toThrow("no picture");
    await expect(p.hideOwnWindows(async () => state.protectedCalls.slice())).resolves.toEqual([true]);
    expect(state.protectedCalls).toEqual([true, false]);
  });
});
