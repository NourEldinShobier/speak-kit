import { describe, expect, it } from "vite-plus/test";
import { createMacLayoutReader, selectedSourceId } from "./layout-reader";

const layoutDump = (name: string) => `(
    {
        InputSourceKind = "Keyboard Layout";
        "KeyboardLayout ID" = 3;
        "KeyboardLayout Name" = ${name};
    }
)
`;

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createMacLayoutReader", () => {
  it("answers empty at first, then with the language of the layout once it was read", async () => {
    const calls: string[][] = [];
    const reader = createMacLayoutReader(
      async (_f, a) => (calls.push([...a]), layoutDump("German")),
      () => 0,
    );
    expect(reader.current()).toBeUndefined();
    await flush();
    expect(reader.current()).toBe("de");
    expect(calls).toEqual([["read", "com.apple.HIToolbox", "AppleSelectedInputSources"]]);
  });

  it("reads again only after a second and follows a change of layout", async () => {
    let clock = 0;
    let out = layoutDump("German");
    let reads = 0;
    const reader = createMacLayoutReader(
      async () => (reads++, out),
      () => clock,
    );
    reader.current();
    await flush();
    out = layoutDump("ABC");
    clock = 999;
    expect(reader.current()).toBe("de");
    expect(reads).toBe(1);
    clock = 1000;
    reader.current();
    await flush();
    expect(reader.current()).toBe("en");
  });

  it("keeps the last answer when a reading fails", async () => {
    let clock = 0;
    let step: "ok" | "fail" = "ok";
    const reader = createMacLayoutReader(
      async () => {
        if (step === "fail") throw new Error("no defaults");
        return layoutDump("French");
      },
      () => clock,
    );
    reader.current();
    await flush();
    for (step of ["fail"] as const) {
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

describe("a layout with no language code", () => {
  it("clears the answer instead of keeping the language of the previous layout", async () => {
    let clock = 0;
    let out = layoutDump("German");
    const reader = createMacLayoutReader(
      async () => out,
      () => clock,
    );
    reader.current();
    await flush();
    expect(reader.current()).toBe("de");
    out = layoutDump("Greek");
    clock = 1000;
    reader.current();
    await flush();
    expect(reader.current()).toBeUndefined();
  });

  it("follows a Japanese input method by its mode", async () => {
    const dump = ["(", "    {", '        "Bundle ID" = "com.apple.inputmethod.Kotoeri";', '        "Input Mode" = "com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese";', "    }", ")"].join("\n");
    const reader = createMacLayoutReader(
      async () => dump,
      () => 0,
    );
    reader.current();
    await flush();
    expect(reader.current()).toBe("ja");
  });
});

describe("selectedSourceId", () => {
  it("names a layout with spaces by its quoted name", () => {
    expect(selectedSourceId('{ "KeyboardLayout Name" = "Canadian French - PC"; }')).toBe("com.apple.keylayout.Canadian French - PC");
  });
  it("is empty for text that holds no input source", () => {
    expect(selectedSourceId("")).toBe("");
    expect(selectedSourceId("The domain/default pair does not exist")).toBe("");
  });
});
