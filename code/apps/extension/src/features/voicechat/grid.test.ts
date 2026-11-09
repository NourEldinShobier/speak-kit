import { describe, expect, it } from "vite-plus/test";
import { COLS, ROWS, gridPattern, type Tone } from "./grid";

const base = { muted: false, level: 0, tick: 0 } as const;
/** The rows as text: . off, - dim, o mid, # on. */
const show = (g: Tone[], cols = COLS) =>
  Array.from({ length: ROWS }, (_, r) =>
    g
      .slice(r * cols, (r + 1) * cols)
      .map((t) => ".-o#"[t])
      .join(""),
  );
const mirrored = (g: Tone[]) => show(g).every((row) => row === [...row].reverse().join(""));

describe("gridPattern", () => {
  it("connecting sweeps one mid column with a dim one behind it", () => {
    expect(show(gridPattern({ ...base, phase: "connecting", tick: 3 }))).toEqual(Array(4).fill("..-o..........."));
    expect(show(gridPattern({ ...base, phase: "connecting", tick: 0 }))).toEqual(Array(4).fill("o.............."));
  });

  it("idle is one dim row, the third", () => {
    expect(show(gridPattern({ ...base, phase: "idle" }))).toEqual(["...............", "...............", "---------------", "..............."]);
  });

  it("muted turns every dot off whatever the phase", () => {
    for (const phase of ["idle", "listening", "speaking", "thinking"] as const) expect(gridPattern({ ...base, phase, muted: true, level: 1 }).every((t) => t === 0)).toBe(true);
  });

  it("listening is two dots high when quiet and grows to four at the centre when loud, mid colour, symmetrical", () => {
    expect(show(gridPattern({ ...base, phase: "listening", level: 0 }))).toEqual(["...............", ".....ooooo.....", ".....ooooo.....", "..............."]);
    const loud = gridPattern({ ...base, phase: "listening", level: 1 });
    expect(show(loud)).toEqual(["....ooooooo....", "ooooooooooooooo", "ooooooooooooooo", "....ooooooo...."]);
    expect(mirrored(loud)).toBe(true);
  });

  it("thinking is a sparse diagonal wave of mid dots that moves with the tick", () => {
    const a = show(gridPattern({ ...base, phase: "thinking", tick: 0 }));
    const b = show(gridPattern({ ...base, phase: "thinking", tick: 1 }));
    expect(a).toEqual(["o......o......o", ".....o......o..", "...o......o....", ".o......o......"]);
    expect(b).not.toEqual(a);
  });

  it("speaking grows from the bottom row in the on colour and follows the level", () => {
    const quiet = gridPattern({ ...base, phase: "speaking", level: 0.2, tick: 0 });
    const loud = gridPattern({ ...base, phase: "speaking", level: 1, tick: 0 });
    const dots = (g: Tone[]) => g.filter((t) => t === 3).length;
    expect(dots(loud)).toBeGreaterThan(dots(quiet));
    expect(show(loud)[3]).toBe("###############");
    expect(mirrored(loud)).toBe(true);
    expect(gridPattern({ ...base, phase: "speaking", level: 0 }).every((t) => t === 0)).toBe(true);
  });
});
