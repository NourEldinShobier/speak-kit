import { describe, expect, it } from "vite-plus/test";
import { mouseButtonOf } from "./mouse-button";

describe("mouseButtonOf", () => {
  it("maps button numbers to the codes the chord tracker uses and tells presses from releases", () => {
    expect(mouseButtonOf(1, 0)).toEqual({ vk: 0x01, down: true });
    expect(mouseButtonOf(2, 0)).toEqual({ vk: 0x01, down: false });
    expect(mouseButtonOf(3, 1)).toEqual({ vk: 0x02, down: true });
    expect(mouseButtonOf(4, 1)).toEqual({ vk: 0x02, down: false });
    expect(mouseButtonOf(25, 2)).toEqual({ vk: 0x04, down: true });
    expect(mouseButtonOf(26, 3)).toEqual({ vk: 0x05, down: false });
    expect(mouseButtonOf(25, 4)).toEqual({ vk: 0x06, down: true });
  });

  it("ignores moves, drags, the wheel and buttons beyond the fifth", () => {
    for (const type of [5, 6, 7, 22, 27]) expect(mouseButtonOf(type, 0)).toBeUndefined();
    expect(mouseButtonOf(25, 5)).toBeUndefined();
    expect(mouseButtonOf(25, -1)).toBeUndefined();
  });
});
