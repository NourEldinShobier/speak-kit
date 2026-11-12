import { describe, expect, it } from "vite-plus/test";
import { isAdvancedRow, peekRow, requestRow, takeRow } from "./focus";

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
