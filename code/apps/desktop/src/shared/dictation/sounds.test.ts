import { describe, expect, it } from "vite-plus/test";
import { soundFor, tonesFor } from "./sounds";

const on = { enabled: true, volume: 50 };

describe("tonesFor", () => {
  it("plays nothing when sounds are off or the volume is 0", () => {
    expect(tonesFor("start", { enabled: false, volume: 50 })).toEqual([]);
    expect(tonesFor("start", { enabled: true, volume: 0 })).toEqual([]);
  });

  it("gives the start tone one short high note at a gain that follows the volume", () => {
    expect(tonesFor("start", on)).toEqual([{ at: 0, ms: 70, hz: 880, gain: 0.16 }]);
    expect(tonesFor("start", { enabled: true, volume: 100 })[0]?.gain).toBeCloseTo(0.32);
    expect(tonesFor("start", { enabled: true, volume: 25 })[0]?.gain).toBeCloseTo(0.08);
  });

  it("gives the error tone two falling notes and never more than full scale", () => {
    const notes = tonesFor("error", { enabled: true, volume: 100 });
    expect(notes.map((n) => n.hz)).toEqual([330, 247]);
    expect(notes.every((n) => n.gain <= 1)).toBe(true);
  });

  it("treats a volume above 100 as 100", () => {
    expect(tonesFor("stop", { enabled: true, volume: 400 })[0]?.gain).toBeCloseTo(0.32);
  });
});

describe("soundFor", () => {
  it.each([
    [{ status: "idle" }, { status: "recording", mode: "hold" }, "start"],
    [{ status: "idle" }, { status: "locked" }, "start"],
    [{ status: "recording" }, { status: "transcribing" }, "stop"],
    [{ status: "locked" }, { status: "transcribing" }, "stop"],
    [{ status: "transcribing" }, { status: "error" }, "error"],
    [{ status: "idle" }, { status: "error" }, "error"],
    [{ status: "idle" }, { status: "idle", notice: { kind: "cancelled" } }, "cancel"],
    [{ status: "recording" }, { status: "idle", notice: { kind: "cancelled" } }, "cancel"],
  ])("%j to %j is %s", (prev, next, expected) => expect(soundFor(prev, next)).toBe(expected));

  it.each([
    [{ status: "recording" }, { status: "recording" }],
    [{ status: "recording" }, { status: "locked" }],
    [{ status: "transcribing" }, { status: "pasting" }],
    [{ status: "pasting" }, { status: "idle", notice: { kind: "inserted" } }],
    [{ status: "error" }, { status: "error" }],
    [
      { status: "idle", notice: { kind: "cancelled" } },
      { status: "idle", notice: { kind: "cancelled" } },
    ],
    [{ status: "recording" }, { status: "idle" }],
  ])("%j to %j is silent", (prev, next) => expect(soundFor(prev, next)).toBeUndefined());
});
