import { describe, expect, it } from "vite-plus/test";
import { authedCall, emptyPairing } from "./pairing";
import { logoBitmap } from "./icon-bitmap";
import { parseConfig } from "../shared/schemas";

const req = (headers: Record<string, string>, localPort = 5000) => ({ headers, socket: { localPort } }) as never;

describe("pairing detection", () => {
  it("counts only calls on our port with the current bearer token", () => {
    expect(authedCall(req({ authorization: "Bearer abc", origin: "chrome-extension://xyz" }), "abc", 5000)).toEqual({ origin: "chrome-extension://xyz" });
    expect(authedCall(req({ authorization: "Bearer abc" }), "abc", 5000)).toEqual({ origin: "" });
    expect(authedCall(req({ authorization: "Bearer old" }), "abc", 5000)).toBeNull();
    expect(authedCall(req({ authorization: "Bearer abc", "x-speakkit-app": "1" }), "abc", 5000)).toBeNull(); // the app's own calls
    expect(authedCall(req({}), "abc", 5000)).toBeNull();
    expect(authedCall(req({ authorization: "Bearer abc" }, 6000), "abc", 5000)).toBeNull();
    expect(authedCall(req({ authorization: "Bearer " }), "", 5000)).toBeNull();
    expect(emptyPairing()).toEqual({ firstSeenMs: null, lastSeenMs: null, origin: null });
  });
});

describe("tray icon bitmaps", () => {
  it("every state is a different 32x32 BGRA image; asleep is grey, error has a red dot", () => {
    const px = (b: Buffer, x: number, y: number) => [...b.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];
    const normal = logoBitmap(32, "normal");
    expect(normal.length).toBe(32 * 32 * 4);
    expect(px(normal, 8, 8)).toEqual([0xf5, 0x57, 0x24, 255]); // brand blue, BGRA
    expect(px(logoBitmap(32, "asleep"), 8, 8)).toEqual([0x85, 0x7d, 0x7a, 255]); // grey
    expect(px(logoBitmap(32, "error"), 26, 26)).toEqual([0x5a, 0x55, 0xf2, 255]); // red dot, bottom right
    const states = ["normal", "working", "asleep", "error"] as const;
    expect(new Set(states.map((s) => logoBitmap(32, s).toString("base64"))).size).toBe(4);
  });
});

describe("config", () => {
  it("fills defaults and replaces bad values field by field", () => {
    expect(parseConfig(undefined)).toMatchObject({ setupDone: false, preferredPort: 47615, idleUnload: "5", loadAtStart: false, batterySaver: true });
    const c = parseConfig({ setupDone: true, preferredPort: "x", idleUnload: "7", speed: 99, theme: "dark" });
    expect(c).toMatchObject({ setupDone: true, preferredPort: 47615, idleUnload: "5", speed: 1, theme: "dark" });
  });
});
