import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error plain ESM script without types
import { foreignMacArch, icoFromPngs, importedPackages, keepWhisperPackage, macSigningPlan, packageOf } from "../scripts/stage-lib.mjs";

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

describe("foreignMacArch", () => {
  it("is true only for a native build of the other macOS architecture", () => {
    expect(foreignMacArch("sharp-darwin-x64", "arm64")).toBe(true);
    expect(foreignMacArch("sharp-libvips-darwin-arm64", "x64")).toBe(true);
    expect(foreignMacArch("koffi-darwin-x64", "arm64")).toBe(true);
    expect(foreignMacArch("darwin_x64", "arm64")).toBe(true);
    expect(foreignMacArch("darwin_arm64", "arm64")).toBe(false);
    for (const d of ["win32_x64", "linux-x64", "sharp-wasm32"]) expect(foreignMacArch(d, "arm64")).toBe(false);
  });
});

describe("keepWhisperPackage", () => {
  it("keeps the loader and both macOS builds on a Mac, and nothing for Windows", () => {
    for (const d of ["whisper.node", "node-whisper-darwin-arm64", "node-whisper-darwin-x64"]) expect(keepWhisperPackage(d, true)).toBe(true);
    for (const d of ["node-whisper-win32-x64", "node-whisper-win32-x64-vulkan", "node-whisper-win32-x64-cuda", "node-whisper-linux-x64", "node-whisper-wasm"])
      expect(keepWhisperPackage(d, true)).toBe(false);
  });

  it("keeps the loader, the Vulkan and the CPU build on Windows, and drops CUDA, WASM and macOS", () => {
    for (const d of ["whisper.node", "node-whisper-win32-x64", "node-whisper-win32-x64-vulkan"]) expect(keepWhisperPackage(d, false)).toBe(true);
    for (const d of ["node-whisper-win32-x64-cuda", "node-whisper-win32-arm64", "node-whisper-darwin-arm64", "node-whisper-wasm"]) expect(keepWhisperPackage(d, false)).toBe(false);
  });
});

describe("the lockfile and the macOS packaging config", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

  it("pins the Metal whisper builds and the koffi builds for both Mac architectures", () => {
    const lock = read("../../../pnpm-lock.yaml");
    for (const pkg of ["@fugood/node-whisper-darwin-arm64@1.2.0-rc.2", "@fugood/node-whisper-darwin-x64@1.2.0-rc.2", "@koromix/koffi-darwin-arm64@", "@koromix/koffi-darwin-x64@"])
      expect(lock).toContain(pkg);
  });

  it("builds a hardened-runtime app with the entitlements the engines need and the usage descriptions the system shows", () => {
    const yml = read("../electron-builder.yml");
    expect(yml).toContain("hardenedRuntime: true");
    expect(yml).toContain("entitlements: build/entitlements.mac.plist");
    expect(yml).toContain("entitlementsInherit: build/entitlements.mac.inherit.plist");
    for (const key of ["NSMicrophoneUsageDescription", "NSAppleEventsUsageDescription", "NSScreenCaptureUsageDescription"]) expect(yml).toContain(key);
    expect(yml).toContain("identity: null"); // unsigned builds keep working
    for (const file of ["../build/entitlements.mac.plist", "../build/entitlements.mac.inherit.plist"]) {
      const plist = read(file);
      for (const key of ["allow-jit", "allow-unsigned-executable-memory", "disable-library-validation", "device.audio-input"]) expect(plist).toContain(key);
    }
  });
});

describe("macSigningPlan", () => {
  it("signs helpers with the inherited entitlements, frameworks with none, and the main app last with the full set and no --deep", () => {
    const plan = macSigningPlan({
      app: "/o/Speak Kit.app",
      nested: ["/o/Speak Kit.app/Contents/Frameworks/Helper.app", "/o/Speak Kit.app/Contents/Frameworks/Electron Framework.framework"],
      entitlements: "main.plist",
      inherit: "inherit.plist",
    });
    const base = ["--force", "--sign", "-", "--options", "runtime"];
    expect(plan).toEqual([
      [...base, "--entitlements", "inherit.plist", "/o/Speak Kit.app/Contents/Frameworks/Helper.app"],
      [...base, "/o/Speak Kit.app/Contents/Frameworks/Electron Framework.framework"],
      [...base, "--entitlements", "main.plist", "/o/Speak Kit.app"],
    ]);
    expect(plan.flat()).not.toContain("--deep");
  });

  it("signs a loose library with no entitlements", () => {
    expect(macSigningPlan({ app: "a.app", nested: ["x/libffmpeg.dylib"], entitlements: "m", inherit: "i" })[0]).toEqual(["--force", "--sign", "-", "--options", "runtime", "x/libffmpeg.dylib"]);
  });

  it("signs only the app when there is nothing nested", () => {
    expect(macSigningPlan({ app: "a.app", nested: [], entitlements: "m", inherit: "i" })).toHaveLength(1);
  });
});
