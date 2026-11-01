import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_DISPLAY, parseDisplay } from "./display";

describe("parseDisplay", () => {
  it("defaults an empty or non-object value", () => {
    expect(parseDisplay(undefined)).toEqual({ theme: "app", font: "sans", size: 19, line: 1.7, width: 680, follow: true });
    expect(parseDisplay("x")).toEqual(DEFAULT_DISPLAY);
  });
  it("keeps valid fields and replaces invalid ones with defaults", () => {
    expect(parseDisplay({ theme: "dark", font: "comic", size: 99, line: 1.5, width: 720 })).toEqual({ theme: "dark", font: "sans", size: 19, line: 1.5, width: 720, follow: true });
  });
});
