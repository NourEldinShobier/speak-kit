import { describe, expect, it } from "vitest";
import { withoutOwn } from "./index";

describe("own windows", () => {
  it("removes the app's windows from the sources", () => {
    expect(withoutOwn([{ id: "window:1" }, { id: "window:2" }], [{ id: "window:2" }])).toEqual([{ id: "window:1" }]);
  });
});
