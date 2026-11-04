import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error plain ESM script without types
import { macIconSvg } from "../scripts/icons-lib.mjs";

/** Pixels with alpha >= 250 (the body; the baked shadow is fainter) of the SVG rendered at 1024 px. */
function body(svg: string) {
  const { pixels, width } = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } }).render();
  const solid = (x: number, y: number) => pixels[(y * width + x) * 4 + 3]! >= 250;
  let minX = width, maxX = -1, minY = width, maxY = -1;
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++)
      if (solid(x, y)) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x)), (minY = Math.min(minY, y)), (maxY = Math.max(maxY, y));
  return { solid, minX, maxX, minY, maxY };
}

describe("macIconSvg", () => {
  const b = body(macIconSvg());

  it("is an 824 px body centred on the 1024 px canvas with a 100 px margin", () => {
    expect([b.minX, b.maxX, b.minY, b.maxY]).toEqual([100, 923, 100, 923]);
  });

  it("has the same silhouette in all four corners (white seams are solid, so only the squircle shows)", () => {
    for (const [x, y] of [[110, 110], [130, 112], [112, 130], [150, 105], [105, 150], [160, 160]] as const) {
      const here = b.solid(x, y);
      expect([b.solid(1023 - x, y), b.solid(x, 1023 - y), b.solid(1023 - x, 1023 - y)]).toEqual([here, here, here]);
    }
  });

  it("is rounded: the grid corner is empty and the middle of each edge is solid", () => {
    expect([b.solid(102, 102), b.solid(512, 101), b.solid(101, 512), b.solid(512, 922), b.solid(922, 512)]).toEqual([false, true, true, true, true]);
  });
});
