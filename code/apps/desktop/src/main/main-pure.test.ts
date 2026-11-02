import { describe, expect, it } from "vite-plus/test";
import { authedCall, emptyPairing } from "./pairing";
import { APP_ICON_PNG, TRAY_ICON_PNG } from "./icon-data";
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

describe("app and tray icons", () => {
  const dims = (b64: string) => {
    const png = Buffer.from(b64, "base64");
    return [png.subarray(1, 4).toString(), png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  it("the app icon is a 256x256 PNG and every tray state is its own 32x32 PNG", () => {
    expect(dims(APP_ICON_PNG)).toEqual(["PNG", 256, 256]);
    expect(Object.keys(TRAY_ICON_PNG).sort()).toEqual(["asleep", "attention", "error", "normal", "paused", "working"]);
    for (const b64 of Object.values(TRAY_ICON_PNG)) expect(dims(b64)).toEqual(["PNG", 32, 32]);
    expect(new Set(Object.values(TRAY_ICON_PNG)).size).toBe(6);
  });
});

describe("config", () => {
  it("fills defaults and replaces bad values field by field", () => {
    expect(parseConfig(undefined)).toMatchObject({ setupDone: false, preferredPort: 47615, idleUnload: "5", loadAtStart: false, batterySaver: true });
    const c = parseConfig({ setupDone: true, preferredPort: "x", idleUnload: "7", speed: 99, theme: "dark" });
    expect(c).toMatchObject({ setupDone: true, preferredPort: 47615, idleUnload: "5", speed: 1 });
  });

  it("ignores the retired theme setting without an error", () => {
    expect(parseConfig({ theme: "dark" })).not.toHaveProperty("theme");
  });
});
