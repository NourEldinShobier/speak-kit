import { describe, expect, it } from "vite-plus/test";
import { createMacLayoutReader } from "./layout-reader";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createMacLayoutReader", () => {
  it("answers empty at first, then with the language of the layout once it was read", async () => {
    const calls: string[][] = [];
    const reader = createMacLayoutReader(
      async (_f, a) => (calls.push([...a]), "com.apple.keylayout.German\n"),
      () => 0,
    );
    expect(reader.current()).toBeUndefined();
    await flush();
    expect(reader.current()).toBe("de");
    expect(calls).toEqual([["read", "com.apple.HIToolbox", "AppleCurrentKeyboardLayoutInputSourceID"]]);
  });

  it("reads again only after a second and follows a change of layout", async () => {
    let clock = 0;
    let out = "com.apple.keylayout.German";
    let reads = 0;
    const reader = createMacLayoutReader(
      async () => (reads++, out),
      () => clock,
    );
    reader.current();
    await flush();
    out = "com.apple.keylayout.ABC";
    clock = 999;
    expect(reader.current()).toBe("de");
    expect(reads).toBe(1);
    clock = 1000;
    reader.current();
    await flush();
    expect(reader.current()).toBe("en");
  });

  it("keeps the last good answer when a reading fails or names a layout it does not know", async () => {
    let clock = 0;
    let step: "ok" | "fail" | "unknown" = "ok";
    const reader = createMacLayoutReader(
      async () => {
        if (step === "fail") throw new Error("no defaults");
        return step === "ok" ? "com.apple.keylayout.French" : "com.apple.keylayout.Klingon";
      },
      () => clock,
    );
    reader.current();
    await flush();
    for (step of ["fail", "unknown"] as const) {
      clock += 1000;
      reader.current();
      await flush();
      expect(reader.current()).toBe("fr");
    }
  });

  it("does not start a second reading while one is running", () => {
    let clock = 0;
    let reads = 0;
    const reader = createMacLayoutReader(
      () => (reads++, new Promise(() => {})),
      () => clock,
    );
    reader.current();
    clock = 5000;
    reader.current();
    expect(reads).toBe(1);
  });
});
