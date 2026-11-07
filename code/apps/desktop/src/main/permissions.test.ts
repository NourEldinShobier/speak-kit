import { describe, expect, it } from "vite-plus/test";
import { grantPermission, type PermissionAsk } from "./permissions";

const ask = (over: Partial<PermissionAsk>): PermissionAsk => ({ permission: "media", mediaTypes: ["audio"], url: "file:///C:/app/renderer/index.html", microphoneWindow: true, ...over });

describe("grantPermission", () => {
  it("grants the microphone to the main window's own page", () => {
    expect(grantPermission(ask({}))).toBe(true);
  });

  it.each([
    ["the camera", { mediaTypes: ["video"] }],
    ["the microphone together with the camera", { mediaTypes: ["audio", "video"] }],
    ["a media request that names no type", { mediaTypes: [] }],
    ["a window that is not the main window", { microphoneWindow: false }],
    ["a web page", { url: "https://example.com/" }],
    ["a page of the local server", { url: "http://127.0.0.1:52700/" }],
    ["notifications", { permission: "notifications" }],
    ["clipboard reads", { permission: "clipboard-read" }],
    ["screen capture", { permission: "display-capture", mediaTypes: [] }],
    ["location", { permission: "geolocation", mediaTypes: [] }],
  ] as [string, Partial<PermissionAsk>][])("denies %s", (_what, over) => {
    expect(grantPermission(ask(over))).toBe(false);
  });
});
