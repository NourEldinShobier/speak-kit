import { describe, expect, it } from "vite-plus/test";
import { layoutCode } from "./layout";

describe("layoutCode", () => {
  it("reads the language from the low word of the layout handle, whatever the region and device bits", () => {
    expect(layoutCode(String(0x04070407))).toBe("de"); // German (Germany)
    expect(layoutCode(String(0x08070807))).toBe("de"); // another region and device word
    expect(layoutCode(String(0x04090409))).toBe("en");
    expect(layoutCode(String(0x04010401))).toBe("ar");
    expect(layoutCode(String(0x04270427))).toBe("lt");
  });
  it("has no code for a layout it does not know, and copes with garbage", () => {
    expect(layoutCode(String(0x04ff04ff))).toBeUndefined();
    expect(layoutCode("0")).toBeUndefined();
    expect(layoutCode("not a number")).toBeUndefined();
    expect(layoutCode("")).toBe(undefined);
  });
});
