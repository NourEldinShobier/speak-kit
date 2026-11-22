import { describe, expect, it } from "vite-plus/test";
import { closeOutcome, KEYBOARD_MAP } from "./behaviour";
import { NETWORK_HOSTS } from "./network";

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

describe("privacy copy", () => {
  it("names the one case where audio leaves the computer", async () => {
    const { NO_TELEMETRY } = await import("./network");
    expect(NO_TELEMETRY).toContain("except voice chat");
  });
});

describe("closing the window", () => {
  it("hides to the tray, with or without work running", () => {
    expect(closeOutcome(false, false)).toBe("hide");
    expect(closeOutcome(true, false)).toBe("hide");
  });
  it("quits when the system would not create the tray icon, and asks first if an export or reading is running", () => {
    expect(closeOutcome(false, true)).toBe("quit");
    expect(closeOutcome(true, true)).toBe("confirm-quit");
  });
});
