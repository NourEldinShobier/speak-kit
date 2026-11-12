import { describe, expect, it } from "vite-plus/test";
import { arrowTarget, isAdvancedRow, peekRow, requestRow, takeRow } from "./focus";

describe("requested row", () => {
  it("is read once", () => {
    requestRow("general/language");
    expect(peekRow()).toBe("general/language");
    expect(takeRow()).toBe("general/language");
    expect(takeRow()).toBeNull();
  });

  it("knows which rows sit behind a fold", () => {
    expect(isAdvancedRow("general", "general/settings-file")).toBe(true);
    expect(isAdvancedRow("general", "general/language")).toBe(false);
    expect(isAdvancedRow("about", "general/settings-file")).toBe(false);
    expect(isAdvancedRow("general", null)).toBe(false);
  });
});

describe("row requests while the page is open", () => {
  it("tell subscribers and stop after unsubscribe", async () => {
    const { subscribeRow } = await import("./focus");
    let n = 0;
    const off = subscribeRow(() => n++);
    requestRow("general/language");
    expect(n).toBe(1);
    off();
    requestRow("general/language");
    expect(n).toBe(1);
  });
});

describe("arrow keys in a list", () => {
  it("move by one and stop at the ends", () => {
    expect(arrowTarget("ArrowDown", 0, 3)).toBe(1);
    expect(arrowTarget("ArrowDown", 2, 3)).toBe(2);
    expect(arrowTarget("ArrowUp", 0, 3)).toBe(0);
    expect(arrowTarget("ArrowUp", 2, 3)).toBe(1);
    expect(arrowTarget("Home", 2, 3)).toBe(0);
    expect(arrowTarget("End", 0, 3)).toBe(2);
  });

  it("ignore other keys, an empty list and a target outside the list", () => {
    expect(arrowTarget("a", 0, 3)).toBeNull();
    expect(arrowTarget("ArrowDown", 0, 0)).toBeNull();
    expect(arrowTarget("ArrowDown", -1, 3)).toBeNull();
  });
});
