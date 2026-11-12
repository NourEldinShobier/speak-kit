import { describe, expect, it } from "vite-plus/test";
import { closeHint, closeOutcome, effectiveCloseAction, KEYBOARD_MAP, reduceMotion, showTrayIcon } from "./behaviour";
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
    expect(closeHint({ closeAction: "hide", hideTrayIcon: true })).toBe("The tray icon is hidden, so closing the window quits Speak Kit. Start it again from the Start menu or Launchpad.");
    expect(closeHint({ closeAction: "quit", hideTrayIcon: false })).toBe("Closing the window quits Speak Kit and stops the extension and the shortcuts.");
    expect(closeHint({ closeAction: "hide", hideTrayIcon: false })).toBe("Keeps Speak Kit in the tray so the extension and the shortcuts keep working. Quit from the tray menu.");
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

describe("network table", () => {
  it("lists every host once with a reason", () => {
    expect(new Set(NETWORK_HOSTS.map((h) => h.host)).size).toBe(NETWORK_HOSTS.length);
    for (const h of NETWORK_HOSTS) expect(h.why.length).toBeGreaterThan(10);
  });
});

describe("keyboard map", () => {
  it("lists the in-app keys exactly", () => {
    expect(KEYBOARD_MAP).toEqual([
      { keys: "Tab, Shift+Tab", does: "Move between controls" },
      { keys: "Arrow keys", does: "Move inside lists, menus and tabs" },
      { keys: "Enter or Space", does: "Press the focused button or toggle" },
      { keys: "Escape", does: "Close a dialog or menu; leave Settings" },
      { keys: "Ctrl+K", does: "Open the command palette" },
      { keys: "Alt+Left, Alt+Right", does: "Go back or forward" },
    ]);
  });
});

describe("closing with work running", () => {
  it("asks before a quit that would lose an export or reading", () => {
    expect(closeOutcome({ closeAction: "quit", hideTrayIcon: false }, true)).toBe("confirm-quit");
    expect(closeOutcome({ closeAction: "hide", hideTrayIcon: true }, true)).toBe("confirm-quit");
  });

  it("quits at once when idle and hides regardless of work", () => {
    expect(closeOutcome({ closeAction: "quit", hideTrayIcon: false }, false)).toBe("quit");
    expect(closeOutcome({ closeAction: "hide", hideTrayIcon: false }, true)).toBe("hide");
  });
});

describe("privacy copy", () => {
  it("names the one case where audio leaves the computer", async () => {
    const { NO_TELEMETRY } = await import("./network");
    expect(NO_TELEMETRY).toContain("except voice chat");
  });
});

describe("a tray icon the system would not create", () => {
  it("closing quits, because nothing could bring a hidden window back", () => {
    expect(effectiveCloseAction({ closeAction: "hide", hideTrayIcon: false }, true)).toBe("quit");
    expect(closeOutcome({ closeAction: "hide", hideTrayIcon: false }, false, true)).toBe("quit");
    expect(closeOutcome({ closeAction: "hide", hideTrayIcon: false }, true, true)).toBe("confirm-quit");
  });
  it("changes nothing while the icon exists", () => {
    expect(closeOutcome({ closeAction: "hide", hideTrayIcon: false }, true, false)).toBe("hide");
  });
});
