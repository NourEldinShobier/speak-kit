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

describe("every language of the table", () => {
  it.each([
    [0x01, "ar"],
    [0x04, "zh"],
    [0x07, "de"],
    [0x09, "en"],
    [0x0a, "es"],
    [0x0c, "fr"],
    [0x10, "it"],
    [0x11, "ja"],
    [0x12, "ko"],
    [0x13, "nl"],
    [0x15, "pl"],
    [0x16, "pt"],
    [0x19, "ru"],
    [0x1d, "sv"],
    [0x1f, "tr"],
    [0x22, "uk"],
    [0x27, "lt"],
    [0x39, "hi"],
  ])("primary language %i is %s", (id, code) => {
    expect(layoutCode(String(0x04000000 + id))).toBe(code);
    expect(layoutCode(String(0xf0000000 + (0x0800 | id)))).toBe(code); // a sub-language and a different device word do not matter
  });
});
