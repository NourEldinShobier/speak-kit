import { describe, expect, it } from "vite-plus/test";
import { closeHint, effectiveCloseAction, nextAnnouncement, reduceMotion, showTrayIcon } from "./behaviour";
import { NETWORK_HOSTS } from "./network";

describe("close and tray", () => {
  it("closing hides by default and quits when asked", () => {
    expect(effectiveCloseAction({ closeAction: "hide", hideTrayIcon: false })).toBe("hide");
    expect(effectiveCloseAction({ closeAction: "quit", hideTrayIcon: false })).toBe("quit");
  });

  it("a hidden tray icon always quits so a window is never lost", () => {
    expect(effectiveCloseAction({ closeAction: "hide", hideTrayIcon: true })).toBe("quit");
    expect(showTrayIcon({ hideTrayIcon: true })).toBe(false);
    expect(showTrayIcon({ hideTrayIcon: false })).toBe(true);
  });

  it("the hint says how to get back in when the tray is hidden", () => {
    expect(closeHint({ closeAction: "hide", hideTrayIcon: true })).toContain("Start menu");
    expect(closeHint({ closeAction: "quit", hideTrayIcon: false })).toContain("quits");
    expect(closeHint({ closeAction: "hide", hideTrayIcon: false })).toContain("tray");
  });
});

describe("reduce motion", () => {
  it("follows the system unless the user chose", () => {
    expect(reduceMotion("system", true)).toBe("on");
    expect(reduceMotion("system", false)).toBe("off");
    expect(reduceMotion("on", false)).toBe("on");
    expect(reduceMotion("off", true)).toBe("off");
  });
});

describe("announcements", () => {
  it("says a new text once and ignores empty or repeated ones", () => {
    expect(nextAnnouncement("", " Recording ")).toBe("Recording");
    expect(nextAnnouncement("Recording", "Recording")).toBeNull();
    expect(nextAnnouncement("Recording", "   ")).toBeNull();
  });
});

describe("network table", () => {
  it("lists every host once with a reason", () => {
    expect(new Set(NETWORK_HOSTS.map((h) => h.host)).size).toBe(NETWORK_HOSTS.length);
    for (const h of NETWORK_HOSTS) expect(h.why.length).toBeGreaterThan(10);
  });
});
