import { describe, expect, it } from "vitest";
import { createGesture } from "./index";

const down = { kind: "down" } as const;
const up = { kind: "up" } as const;
const esc = { kind: "escape" } as const;

describe("capture key gesture", () => {
  it("arms on press and starts on release", () => {
    const g = createGesture();
    expect(g.event(down, 0, false)).toEqual(["arm"]);
    expect(g.event(up, 900, false)).toEqual(["start"]);
  });
  it("ignores key repeat: one capture per gesture", () => {
    const g = createGesture();
    expect(g.event(down, 0, false)).toEqual(["arm"]);
    expect(g.event(down, 30, false)).toEqual([]);
    expect(g.event(down, 60, false)).toEqual([]);
    expect(g.event(up, 100, false)).toEqual(["start"]);
    expect(g.event(up, 120, false)).toEqual([]);
  });
  it("records nothing when Esc comes before the release, and swallows that release", () => {
    const g = createGesture();
    g.event(down, 0, false);
    expect(g.event(esc, 50, false)).toEqual(["cancel"]);
    expect(g.event(up, 80, false)).toEqual([]);
    expect(g.event(down, 500, false)).toEqual(["arm"]);
    expect(g.event(up, 520, false)).toEqual(["start"]);
  });
  it("Esc with no key down does nothing", () => {
    expect(createGesture().event(esc, 0, false)).toEqual([]);
  });
  it("a tap while recording stops", () => {
    const g = createGesture();
    expect(g.event(down, 0, true)).toEqual([]);
    expect(g.event(up, 120, true)).toEqual(["stop"]);
  });
  it("a hold while recording inks until the release and does not stop", () => {
    const g = createGesture();
    g.event(down, 0, true);
    expect(g.tick(200, true)).toEqual([]);
    expect(g.tick(300, true)).toEqual(["ink-start"]);
    expect(g.tick(400, true)).toEqual([]);
    expect(g.event(up, 900, true)).toEqual(["ink-end"]);
  });
  it("a long press that never ticked neither stops nor inks", () => {
    const g = createGesture();
    g.event(down, 0, true);
    expect(g.event(up, 2000, true)).toEqual([]);
  });
  it("tick does nothing when the key is up or nothing is recording", () => {
    const g = createGesture();
    expect(g.tick(1000, true)).toEqual([]);
    g.event(down, 0, false);
    expect(g.tick(1000, false)).toEqual([]);
  });
  it("reset forgets a key believed down (screen lock, sleep)", () => {
    const g = createGesture();
    g.event(down, 0, false);
    g.reset();
    expect(g.down).toBe(false);
    expect(g.event(down, 10, false)).toEqual(["arm"]);
  });
});
