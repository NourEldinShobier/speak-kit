import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error plain ESM script without types
import { icoFromPngs, importedPackages, packageOf } from "../scripts/stage-lib.mjs";

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

describe("icoFromPngs", () => {
  it("writes an ICO directory pointing at each PNG; 256 px is stored as 0", () => {
    const a = Buffer.from("aaaa");
    const b = Buffer.from("bbbbbb");
    const ico = icoFromPngs([
      { size: 16, png: a },
      { size: 256, png: b },
    ]) as Buffer;
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2]);
    expect([ico[6], ico[7], ico.readUInt32LE(14), ico.readUInt32LE(18)]).toEqual([16, 16, 4, 38]);
    expect([ico[22], ico[23], ico.readUInt32LE(30), ico.readUInt32LE(34)]).toEqual([0, 0, 6, 42]);
    expect(ico.subarray(38).toString()).toBe("aaaabbbbbb");
  });
});
