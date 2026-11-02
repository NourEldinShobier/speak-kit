import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_SHORTCUTS, type ShortcutId } from "../shared/shortcuts";
import { ShortcutRegistry } from "./shortcuts";

/** A fake OS: `foreign` accelerators belong to another app. */
function setup(foreign: string[] = []) {
  const live = new Map<string, () => void>();
  const ran: ShortcutId[] = [];
  let now = 0;
  const reg = new ShortcutRegistry(
    {
      register: (a, cb) => {
        if (foreign.includes(a) || live.has(a)) return false;
        live.set(a, cb);
        return true;
      },
      unregister: (a) => void live.delete(a),
    },
    (id) => ran.push(id),
    () => now,
  );
  return { reg, live, ran, advance: (ms: number) => (now += ms), press: (a: string) => live.get(a)?.() };
}

describe("ShortcutRegistry", () => {
  it("registers the four defaults and runs the action on a press", () => {
    const t = setup();
    expect(t.reg.apply(DEFAULT_SHORTCUTS)).toEqual({});
    expect([...t.live.keys()].sort()).toEqual(["Ctrl+Alt+C", "Ctrl+Alt+S", "Ctrl+Alt+Space", "Ctrl+Alt+X"]);
    t.press("Ctrl+Alt+S");
    t.advance(1000);
    t.press("Ctrl+Alt+Space");
    expect(t.ran).toEqual(["read-selection", "play-pause"]);
  });

  it("treats key repeat while the keys are held as one press", () => {
    const t = setup();
    t.reg.apply(DEFAULT_SHORTCUTS);
    t.press("Ctrl+Alt+X");
    t.advance(100);
    t.press("Ctrl+Alt+X");
    t.advance(400);
    t.press("Ctrl+Alt+X");
    expect(t.ran).toEqual(["stop", "stop"]);
  });

  it("reports a combination another app owns, with a free alternative, and registers the rest", () => {
    const t = setup(["Ctrl+Alt+S"]);
    const c = t.reg.apply(DEFAULT_SHORTCUTS);
    expect(c).toEqual({ "read-selection": { accelerator: "Ctrl+Alt+S", reason: "taken", suggestion: "Ctrl+Alt+Shift+S" } });
    expect(t.live.size).toBe(3);
  });

  it("flags the second of two actions that share a combination", () => {
    const t = setup();
    const c = t.reg.apply({ ...DEFAULT_SHORTCUTS, stop: "Ctrl+Alt+S" });
    expect(c.stop).toMatchObject({ reason: "duplicate", accelerator: "Ctrl+Alt+S" });
    expect(c["read-selection"]).toBeUndefined();
    expect(t.live.size).toBe(3);
  });

  it("set() rebinds, and unregisters the old combination", () => {
    const t = setup();
    t.reg.apply(DEFAULT_SHORTCUTS);
    const r = t.reg.set(DEFAULT_SHORTCUTS, "stop", "ctrl+alt+q");
    expect(r).toEqual({ ok: true, conflicts: {} });
    expect(t.live.has("Ctrl+Alt+X")).toBe(false);
    expect(t.live.has("Ctrl+Alt+Q")).toBe(true);
  });

  it("set() never overrides: an app conflict restores the old set and returns the alternative", () => {
    const t = setup(["Ctrl+Alt+Q"]);
    t.reg.apply(DEFAULT_SHORTCUTS);
    const r = t.reg.set(DEFAULT_SHORTCUTS, "stop", "Ctrl+Alt+Q");
    expect(r).toEqual({ ok: false, error: { code: "shortcut-taken" }, conflict: { accelerator: "Ctrl+Alt+Q", reason: "taken", suggestion: "Ctrl+Alt+Shift+Q" } });
    expect(t.live.has("Ctrl+Alt+X")).toBe(true);
  });

  it("set() refuses invalid keys and a combination Speak Kit already uses", () => {
    const t = setup();
    t.reg.apply(DEFAULT_SHORTCUTS);
    expect(t.reg.set(DEFAULT_SHORTCUTS, "stop", "Alt+F4")).toEqual({ ok: false, error: { code: "shortcut-reserved" } });
    const dup = t.reg.set(DEFAULT_SHORTCUTS, "stop", "Ctrl+Alt+S");
    expect(dup).toMatchObject({ ok: false, error: { code: "shortcut-duplicate" }, conflict: { reason: "duplicate", suggestion: "Ctrl+Alt+Shift+S" } });
  });
});
