import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { CAPTURE_ARGS } from "./contract";

const ok = (schema: v.GenericSchema, args: unknown[]) => v.safeParse(schema, args).success;

describe("capture ipc arguments", () => {
  it("source takes a file of the folder or a frame of a recording, never a path out of it", () => {
    expect(ok(CAPTURE_ARGS.source, ["c1", "shot.png"])).toBe(true);
    expect(ok(CAPTURE_ARGS.source, ["c1", "frames/f-00001000.jpg"])).toBe(true);
    expect(ok(CAPTURE_ARGS.source, ["c1", "frames\\f-00001000.jpg"])).toBe(true);
    for (const bad of ["../x.png", "frames/../x.png", "other/f.jpg", "/etc/passwd", "frames/a/b.jpg", ""]) expect(ok(CAPTURE_ARGS.source, ["c1", bad])).toBe(false);
  });

  it("trim takes whole milliseconds inside a day", () => {
    expect(ok(CAPTURE_ARGS.trim, ["c1", 0, 1000])).toBe(true);
    for (const bad of [
      [-1, 1000],
      [0.5, 1000],
      [0, 0],
      [0, 86_400_001],
      ["0", 1000],
    ])
      expect(ok(CAPTURE_ARGS.trim, ["c1", ...bad])).toBe(false);
    expect(ok(CAPTURE_ARGS.trim, ["../c1", 0, 1000])).toBe(false);
  });
});
