import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vite-plus/test";
import { checkPackage, stripSourceMapComments, zipDir } from "./pack-store.mjs";

// 1x1 PNG header with the given size in the IHDR chunk (only the header is read).
const png = (n) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(n, 16);
  b.writeUInt32BE(n, 20);
  return b;
};
const MANIFEST = {
  manifest_version: 3,
  name: "Speak Kit",
  version: "0.3.0",
  description: "Natural local text-to-speech.",
  icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
  action: { default_popup: "popup.html" },
  background: { service_worker: "background.js" },
};
const FILES = { "popup.html": "<html></html>", "background.js": "console.log(1)\n" };
const pkg = (manifest = MANIFEST, extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "sk-pack-"));
  const put = (p, d) => {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), d);
  };
  put("manifest.json", JSON.stringify(manifest));
  for (const n of [16, 32, 48, 128]) put(`icons/${n}.png`, png(n));
  for (const [p, d] of Object.entries({ ...FILES, ...extra })) put(p, d);
  return dir;
};
const failures = (dir) =>
  checkPackage(dir)
    .filter((r) => !r.ok)
    .map((r) => r.name);

describe("checkPackage", () => {
  it("passes a clean package", () => {
    expect(failures(pkg())).toEqual([]);
  });
  it("fails a missing icon size", () => {
    expect(failures(pkg({ ...MANIFEST, icons: { 16: "icons/16.png", 48: "icons/48.png", 128: "icons/128.png" } }))).toEqual(["icon 32x32"]);
  });
  it("fails an icon file of the wrong dimensions", () => {
    const dir = pkg();
    writeFileSync(join(dir, "icons/48.png"), png(32));
    expect(failures(dir)).toEqual(["icon 48x48"]);
  });
  it("fails manifest v2 and a long description", () => {
    expect(failures(pkg({ ...MANIFEST, manifest_version: 2, description: "x".repeat(133) }))).toEqual(["manifest_version is 3", "description present, 132 characters or fewer"]);
  });
  it("fails a file the manifest names that is not packed", () => {
    expect(failures(pkg({ ...MANIFEST, options_ui: { page: "options.html" } }))).toEqual(["every file the manifest names is in the package"]);
  });
  it("fails source maps", () => {
    expect(failures(pkg(MANIFEST, { "background.js.map": "{}" }))).toEqual(["no source maps"]);
    expect(failures(pkg(MANIFEST, { "background.js": "x\n//# sourceMappingURL=background.js.map" }))).toEqual(["no source maps"]);
  });
  it("fails eval, new Function and remote code", () => {
    expect(failures(pkg(MANIFEST, { "background.js": "eval('1')" }))).toEqual(["no eval or new Function"]);
    expect(failures(pkg(MANIFEST, { "background.js": "const f = new Function('a','return a')" }))).toEqual(["no eval or new Function"]);
    expect(failures(pkg(MANIFEST, { "popup.html": '<script src="https://cdn.example.com/a.js"></script>' }))).toEqual(["no remote code (script tags, importScripts, import() from http)"]);
  });
  it("fails test hooks", () => {
    expect(failures(pkg(MANIFEST, { "background.js": "if (__TEST__) x()" }))).toEqual(["no test hooks"]);
  });
  it("fails without a manifest at the root", () => {
    expect(checkPackage(mkdtempSync(join(tmpdir(), "sk-pack-")))[0]).toMatchObject({ name: "manifest.json at the root", ok: false });
  });
});

describe("stripSourceMapComments", () => {
  it("removes the trailing comment and reports the file", () => {
    const dir = pkg(MANIFEST, { "background.js": "run();\n//# sourceMappingURL=x.js.map\n" });
    expect(stripSourceMapComments(dir)).toEqual(["background.js"]);
    expect(readFileSync(join(dir, "background.js"), "utf8")).toBe("run();\n");
    expect(failures(dir)).toEqual([]);
  });
});

describe("zipDir", () => {
  it("puts manifest.json at the root and stores every file", () => {
    const zip = zipDir(pkg());
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(7);
    // first entry in sorted order
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const nameLen = zip.readUInt16LE(26);
    expect(zip.toString("utf8", 30, 30 + nameLen)).toBe("background.js");
    const size = zip.readUInt32LE(18);
    const body = zip.subarray(30 + nameLen, 30 + nameLen + size);
    expect((zip.readUInt16LE(8) === 8 ? inflateRawSync(body) : body).toString()).toBe("console.log(1)\n");
    expect(zip.includes(Buffer.from("manifest.json"))).toBe(true);
    expect(zip.includes(Buffer.from("/manifest.json"))).toBe(false);
  });
  it("gives the same bytes for the same input", () => {
    const dir = pkg();
    expect(zipDir(dir).equals(zipDir(dir))).toBe(true);
  });
});
