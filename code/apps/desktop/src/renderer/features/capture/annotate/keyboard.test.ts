import { describe, expect, it } from "vitest";
import { movePointer, shortcutOf } from "./keyboard";

const box = { width: 100, height: 50 };
const key = (k: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => shortcutOf({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...o });

describe("keyboard drawing", () => {
  it("moves 10 pixels per key and 50 with Shift", () => {
    expect(movePointer({ x: 20, y: 20 }, { key: "ArrowRight", shiftKey: false }, box)).toEqual({ x: 30, y: 20 });
    expect(movePointer({ x: 20, y: 20 }, { key: "ArrowUp", shiftKey: true }, box)).toEqual({ x: 20, y: 0 });
    expect(movePointer({ x: 20, y: 20 }, { key: "ArrowLeft", shiftKey: false }, box)).toEqual({ x: 10, y: 20 });
    expect(movePointer({ x: 20, y: 20 }, { key: "ArrowDown", shiftKey: false }, box)).toEqual({ x: 20, y: 30 });
  });

  it("stops at the edges of the picture", () => {
    expect(movePointer({ x: 95, y: 45 }, { key: "ArrowRight", shiftKey: true }, box)).toEqual({ x: 100, y: 45 });
    expect(movePointer({ x: 3, y: 45 }, { key: "ArrowLeft", shiftKey: false }, box)).toEqual({ x: 0, y: 45 });
    expect(movePointer({ x: 3, y: 48 }, { key: "ArrowDown", shiftKey: true }, box)).toEqual({ x: 3, y: 50 });
  });

  it("ignores other keys", () => {
    expect(movePointer({ x: 1, y: 1 }, { key: "a", shiftKey: false }, box)).toBeUndefined();
  });

  it("maps Ctrl or Command with Z and Y to undo and redo", () => {
    expect(key("z", { ctrlKey: true })).toBe("undo");
    expect(key("Z", { metaKey: true })).toBe("undo");
    expect(key("z", { ctrlKey: true, shiftKey: true })).toBe("redo");
    expect(key("y", { ctrlKey: true })).toBe("redo");
  });

  it("needs the modifier", () => {
    expect(key("z")).toBeUndefined();
    expect(key("x", { ctrlKey: true })).toBeUndefined();
  });
});
