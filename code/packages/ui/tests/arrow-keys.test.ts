import { describe, expect, test } from "vite-plus/test";
import { arrowTarget, onArrowKeys } from "../src/react/arrow-keys";

describe("arrowTarget", () => {
  test("moves one item, stops at the ends and does not wrap", () => {
    expect(arrowTarget("ArrowDown", 0, 3)).toBe(1);
    expect(arrowTarget("ArrowDown", 2, 3)).toBe(2);
    expect(arrowTarget("ArrowUp", 0, 3)).toBe(0);
    expect(arrowTarget("ArrowUp", 2, 3)).toBe(1);
    expect(arrowTarget("Home", 2, 3)).toBe(0);
    expect(arrowTarget("End", 0, 3)).toBe(2);
  });
  test("a vertical list ignores Left and Right, a row of cards takes them", () => {
    expect(arrowTarget("ArrowRight", 0, 3, false)).toBeNull();
    expect(arrowTarget("ArrowLeft", 1, 3, false)).toBeNull();
    expect(arrowTarget("ArrowRight", 0, 3)).toBe(1);
    expect(arrowTarget("ArrowLeft", 1, 3)).toBe(0);
  });
  test("does nothing for other keys, an empty list or a focus outside the items", () => {
    expect(arrowTarget("a", 0, 3)).toBeNull();
    expect(arrowTarget("ArrowDown", 0, 0)).toBeNull();
    expect(arrowTarget("ArrowDown", -1, 3)).toBeNull();
  });
});

/** A list as the handler sees it: items that can be focused, disabled or hidden, and a field that is not one of them. */
function fakeList() {
  const focused: string[] = [];
  const item = (id: string, attrs: Record<string, string> = {}) => ({ id, focus: () => focused.push(id), hasAttribute: (n: string) => n in attrs, getAttribute: (n: string) => attrs[n] ?? null });
  const a = item("a");
  const b = item("b");
  const c = item("c", { disabled: "" });
  const d = item("d", { "aria-hidden": "true" });
  const e = item("e");
  const field = item("field");
  const root = { querySelectorAll: (s: string) => (s === ".i" ? [a, b, c, d, e] : []) };
  const press = (key: string, target: unknown) => {
    let prevented = false;
    onArrowKeys(".i")({ key, target, currentTarget: root, preventDefault: () => (prevented = true) } as never);
    return prevented;
  };
  return { a, b, e, field, focused, press };
}

describe("onArrowKeys", () => {
  test("moves focus to the next item, skipping a disabled one and a hidden one", () => {
    const l = fakeList();
    expect(l.press("ArrowDown", l.a)).toBe(true);
    l.press("ArrowDown", l.b);
    l.press("Home", l.e);
    l.press("End", l.a);
    expect(l.focused).toEqual(["b", "e", "a", "e"]);
  });

  test("leaves a key pressed in a field inside a row alone", () => {
    const l = fakeList();
    expect(l.press("ArrowDown", l.field)).toBe(false);
    expect(l.focused).toEqual([]);
  });

  test("does not take a key that is not an arrow", () => {
    const l = fakeList();
    expect(l.press("Enter", l.a)).toBe(false);
    expect(l.press("ArrowRight", l.a)).toBe(false);
  });
});
