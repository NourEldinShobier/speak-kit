import { describe, expect, it } from "vitest";
import { cropOrFull } from "./index";

const frame = { width: 100, height: 50 };
const ops = { crop: (r: unknown): unknown => ["crop", r], full: (): unknown => "full" };
const cropped = (x: number, y: number, width: number, height: number) => cropOrFull(frame, { x, y, width, height }, ops);

describe("window crop edges", () => {
  it("accepts a rectangle that touches every edge of the frame but is smaller than it", () => {
    expect(cropped(0, 0, 100, 49)).toEqual(["crop", { x: 0, y: 0, width: 100, height: 49 }]);
    expect(cropped(0, 0, 99, 50)).toEqual(["crop", { x: 0, y: 0, width: 99, height: 50 }]);
    expect(cropped(1, 0, 99, 50)).toEqual(["crop", { x: 1, y: 0, width: 99, height: 50 }]);
    expect(cropped(0, 1, 100, 49)).toEqual(["crop", { x: 0, y: 1, width: 100, height: 49 }]);
  });
  it("takes the whole frame only for a rectangle that is exactly the frame", () => {
    expect(cropped(0, 0, 100, 50)).toBe("full");
  });
  it("rejects a rectangle one pixel outside on any side", () => {
    expect(cropped(-1, 0, 50, 50)).toBe("full");
    expect(cropped(0, -1, 50, 40)).toBe("full");
    expect(cropped(51, 0, 50, 50)).toBe("full");
    expect(cropped(0, 11, 50, 40)).toBe("full");
  });
  it("rejects empty or negative sizes and values that are not numbers", () => {
    expect(cropped(0, 0, 0, 10)).toBe("full");
    expect(cropped(0, 0, 10, 0)).toBe("full");
    expect(cropped(0, 0, -5, 10)).toBe("full");
    expect(cropped(Number.NaN, 0, 10, 10)).toBe("full");
    expect(cropped(0, Number.POSITIVE_INFINITY, 10, 10)).toBe("full");
    expect(cropOrFull(frame, undefined, ops)).toBe("full");
  });
  it("rounds a fractional rectangle", () => {
    expect(cropped(0.4, 0.6, 10.2, 9.7)).toEqual(["crop", { x: 0, y: 1, width: 10, height: 10 }]);
  });
  it("a window at the corner with the frame's width but not its height is still cut", () => {
    expect(cropped(0, 0, 100, 10)).toEqual(["crop", { x: 0, y: 0, width: 100, height: 10 }]);
    expect(cropped(0, 0, 10, 50)).toEqual(["crop", { x: 0, y: 0, width: 10, height: 50 }]);
  });
  it("without an error callback a failing crop still gives the whole frame", () => {
    const crop = () => {
      throw new Error("x");
    };
    expect(cropOrFull(frame, { x: 1, y: 1, width: 5, height: 5 }, { crop, full: (): unknown => "full" })).toBe("full");
  });
});
