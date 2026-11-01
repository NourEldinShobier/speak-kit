import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error plain ESM script without types
import { icoFromBgra, importedPackages, packageOf } from "../scripts/stage-lib.mjs";

describe("packageOf", () => {
  it("returns the package of a bare specifier, and null for relative, builtin and electron imports", () => {
    expect(packageOf("valibot")).toBe("valibot");
    expect(packageOf("pdfjs-dist/legacy/build/pdf.mjs")).toBe("pdfjs-dist");
    expect(packageOf("@mozilla/readability")).toBe("@mozilla/readability");
    expect(packageOf("@lingo-reader/epub-parser/dist/x.js")).toBe("@lingo-reader/epub-parser");
    expect(packageOf("lowdb/node")).toBe("lowdb");
    for (const s of ["./x.js", "../y", "node:fs", "fs", "fs/promises", "electron", "file:///a"]) expect(packageOf(s)).toBeNull();
  });
});

describe("importedPackages", () => {
  it("finds static, dynamic and require imports once each, sorted", () => {
    const src = `
      import fs from "node:fs";
      import { app } from "electron";
      import Store from "electron-store";
      import * as v from 'valibot';
      const k = (await import("koffi")).default;
      const u = await import("electron-updater");
      const z = require("zod/v4");
      import "./local.js";
      export { x } from "valibot";
    `;
    expect(importedPackages(src)).toEqual(["electron-store", "electron-updater", "koffi", "valibot", "zod"]);
  });
});

describe("icoFromBgra", () => {
  it("writes an ICO header, a 32-bit DIB and flips the rows bottom-up", () => {
    const size = 2;
    const px = Buffer.from([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255]);
    const ico = icoFromBgra(px, size) as Buffer;
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 1]);
    expect([ico[6], ico[7], ico.readUInt16LE(12)]).toEqual([2, 2, 32]);
    const dibLen = ico.readUInt32LE(14);
    expect(ico.length).toBe(22 + dibLen);
    expect(ico.readUInt32LE(22)).toBe(40);
    expect(ico.readInt32LE(30)).toBe(4); // height counts image and mask
    // bottom row (pixels 3, 4) comes first
    expect([ico[62], ico[66]]).toEqual([3, 4]);
    expect([ico[70], ico[74]]).toEqual([1, 2]);
  });
});
