import { expect, test } from "vite-plus/test";
import { readingKey } from "./input";

test("each reading shortcut maps to its player effect", () => {
  expect(readingKey("ArrowRight", 1.2, false)).toEqual({ cmd: { cmd: "next-block" } });
  expect(readingKey("ArrowLeft", 1.2, false)).toEqual({ cmd: { cmd: "prev-block" } });
  expect(readingKey(" ", 1.2, false)).toEqual({ cmd: { cmd: "toggle" } });
  expect(readingKey("Escape", 1.2, false)).toEqual({ cmd: { cmd: "stop" } });
  expect(readingKey("Escape", 1.2, true)).toEqual({ closePopover: true });
  expect(readingKey("a", 1.2, false)).toBeUndefined();
});

test("arrow up and down change the speed by 0.1, snap to 0.05 and stay within 0.5 to 3", () => {
  expect(readingKey("ArrowUp", 1.2, false)).toEqual({ speed: 1.3 });
  expect(readingKey("ArrowDown", 1.2, false)).toEqual({ speed: 1.1 });
  expect(readingKey("ArrowUp", 1.23, false)).toEqual({ speed: 1.35 });
  expect(readingKey("ArrowUp", 2.95, false)).toEqual({ speed: 3 });
  expect(readingKey("ArrowDown", 0.55, false)).toEqual({ speed: 0.5 });
});
