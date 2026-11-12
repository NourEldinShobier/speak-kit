import { describe, expect, it } from "vite-plus/test";
import { startupView } from "./startup";

describe("startupView", () => {
  it("shows nothing for the first 400 ms so a quick start does not flash", () => {
    expect(startupView(0)).toBe("quiet");
    expect(startupView(399)).toBe("quiet");
  });
  it("shows the loading line from 400 ms and the slow explanation from 10 s", () => {
    expect(startupView(400)).toBe("loading");
    expect(startupView(9_999)).toBe("loading");
    expect(startupView(10_000)).toBe("slow");
  });
});
