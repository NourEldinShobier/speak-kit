import { describe, expect, it } from "vite-plus/test";
import { pausedFor } from "./pause-rules";

const rules = (r: Partial<Parameters<typeof pausedFor>[0]>) => ({ mode: "off" as const, apps: [] as string[], fullscreen: false, ...r });
const fg = (exe: string | null, fullscreen = false) => ({ exe, fullscreen });

describe("pause rules", () => {
  it("never pauses when nothing is configured", () => {
    expect(pausedFor(rules({}), fg("game.exe", true))).toBe(false);
  });

  it("never pauses when the foreground program is unknown, whatever the rules", () => {
    expect(pausedFor(rules({ mode: "allow", apps: ["code"], fullscreen: true }), null)).toBe(false);
  });

  it("block list pauses only in the listed programs, ignoring case, spaces and .exe", () => {
    const r = rules({ mode: "block", apps: [" Game.EXE ", "editor"] });
    expect(pausedFor(r, fg("game.exe"))).toBe(true);
    expect(pausedFor(r, fg("EDITOR"))).toBe(true);
    expect(pausedFor(r, fg("notepad.exe"))).toBe(false);
  });

  it("allow list pauses everywhere except the listed programs", () => {
    const r = rules({ mode: "allow", apps: ["code.exe"] });
    expect(pausedFor(r, fg("code.exe"))).toBe(false);
    expect(pausedFor(r, fg("game.exe"))).toBe(true);
  });

  it("an empty list pauses nothing, so an allow list that was just switched on does not switch dictation off", () => {
    expect(pausedFor(rules({ mode: "allow", apps: [] }), fg("game.exe"))).toBe(false);
    expect(pausedFor(rules({ mode: "block", apps: [] }), fg("game.exe"))).toBe(false);
  });

  it("a program that cannot be identified is never paused by a list, but full screen still applies", () => {
    expect(pausedFor(rules({ mode: "allow", apps: ["code"] }), fg(null))).toBe(false);
    expect(pausedFor(rules({ fullscreen: true }), fg(null, true))).toBe(true);
  });

  it("full screen pauses on its own and only when asked for", () => {
    expect(pausedFor(rules({ fullscreen: true }), fg("any.exe", true))).toBe(true);
    expect(pausedFor(rules({ fullscreen: true }), fg("any.exe", false))).toBe(false);
    expect(pausedFor(rules({ fullscreen: false }), fg("any.exe", true))).toBe(false);
  });

  it("full screen wins over an allow list that names the program", () => {
    expect(pausedFor(rules({ mode: "allow", apps: ["game"], fullscreen: true }), fg("game.exe", true))).toBe(true);
  });
});
