import { describe, expect, it } from "vite-plus/test";
import { checkAccelerator, DEFAULT_SHORTCUTS, duplicateIds, normalize, recordKey, showAccelerator, suggestAlternative } from "./shortcuts";

const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}, platform = "win32") =>
  recordKey({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods }, platform);

describe("accelerators", () => {
  it("normalizes spelling and order", () => {
    expect(normalize("alt+ctrl+s")).toBe("Ctrl+Alt+S");
    expect(normalize("Control+Shift+space")).toBe("Ctrl+Shift+Space");
    expect(normalize("ctrl+alt+f12")).toBe("Ctrl+Alt+F12");
    expect(normalize("Ctrl+Alt")).toBeNull();
    expect(normalize("Ctrl+Alt+S+D")).toBeNull();
  });

  it("accepts the four defaults", () => {
    for (const acc of Object.values(DEFAULT_SHORTCUTS)) expect(checkAccelerator(acc)).toBeNull();
  });

  it("rejects combinations that would break typing or Windows", () => {
    expect(checkAccelerator("S")).toEqual({ code: "shortcut-needs-modifier" });
    expect(checkAccelerator("Shift+S")).toEqual({ code: "shortcut-needs-modifier" });
    expect(checkAccelerator("Ctrl+C")).toEqual({ code: "shortcut-needs-two" });
    expect(checkAccelerator("Alt+F4")).toEqual({ code: "shortcut-reserved" });
    expect(checkAccelerator("Ctrl+Alt+Delete")).toEqual({ code: "shortcut-reserved" });
    expect(checkAccelerator("nonsense")).toEqual({ code: "shortcut-invalid" });
    expect(checkAccelerator("Ctrl+F9")).toBeNull();
  });
});

describe("conflicts", () => {
  it("finds two actions on one accelerator, whatever the spelling", () => {
    const b = { ...DEFAULT_SHORTCUTS, stop: "alt+ctrl+s" };
    expect([...duplicateIds(b)].sort()).toEqual(["read-selection", "stop"]);
    expect(duplicateIds(DEFAULT_SHORTCUTS).size).toBe(0);
  });

  it("suggests the same key with Shift first, then another free letter", () => {
    expect(suggestAlternative("Ctrl+Alt+S", new Set(["Ctrl+Alt+S"]))).toBe("Ctrl+Alt+Shift+S");
    expect(suggestAlternative("Ctrl+Alt+S", new Set(["Ctrl+Alt+S", "Ctrl+Alt+Shift+S"]))).toBe("Ctrl+Alt+Q");
    expect(suggestAlternative("junk", new Set())).toBeNull();
  });
});

describe("showAccelerator", () => {
  it.each([
    ["Ctrl+K", "win32", "app", "Ctrl+K"],
    ["Ctrl+K", "darwin", "app", "Cmd+K"],
    ["Ctrl+Alt+S", "darwin", "global", "Ctrl+Option+S"],
    ["Ctrl+Alt+S", "linux", "global", "Ctrl+Alt+S"],
  ])("%s on %s (%s) reads %s", (accelerator, platform, scope, expected) => {
    expect(showAccelerator(accelerator, platform, scope as "app" | "global")).toBe(expected);
  });
});

describe("recorder", () => {
  it("records a combination", () => {
    expect(key("KeyK", { ctrlKey: true, altKey: true })).toEqual({ kind: "accelerator", accelerator: "Ctrl+Alt+K" });
    expect(key("Space", { altKey: true, ctrlKey: true, shiftKey: true })).toEqual({ kind: "accelerator", accelerator: "Ctrl+Alt+Shift+Space" });
    expect(key("Digit5", { ctrlKey: true, altKey: true })).toEqual({ kind: "accelerator", accelerator: "Ctrl+Alt+5" });
    expect(key("ArrowUp", { ctrlKey: true, altKey: true })).toEqual({ kind: "accelerator", accelerator: "Ctrl+Alt+Up" });
  });

  it("Escape cancels, a lone modifier waits, bad input explains itself", () => {
    expect(key("Escape")).toEqual({ kind: "cancel" });
    expect(key("ControlLeft", { ctrlKey: true })).toEqual({ kind: "waiting" });
    expect(key("KeyA")).toEqual({ kind: "invalid", reason: { code: "shortcut-needs-modifier" } });
    expect(key("KeyA", { metaKey: true, ctrlKey: true })).toEqual({ kind: "invalid", reason: { code: "shortcut-meta-key", args: { platform: "win32" } } });
    expect(key("KeyA", { metaKey: true, ctrlKey: true }, "darwin")).toEqual({ kind: "invalid", reason: { code: "shortcut-meta-key", args: { platform: "darwin" } } });
    expect(key("IntlRo", { ctrlKey: true, altKey: true })).toEqual({ kind: "invalid", reason: { code: "shortcut-bad-key" } });
  });
});
