import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { downloadDirs, measureDownloads, removeDownloads } from "./downloads";

const roots: string[] = [];
function dataRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "sk-dl-"));
  roots.push(root);
  const put = (rel: string, text: string) => {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  };
  put("models/onnx/model.onnx", "x".repeat(100));
  put("engines/chatterbox/env/python.exe", "x".repeat(50));
  put("chatterbox/installed", "x".repeat(5));
  put("exports/a.wav", "x".repeat(20));
  put("IndexedDB/ocr/eng.traineddata", "x".repeat(10));
  put("library/library.json", '{"docs":1}');
  put("voices/me.wav", "clone");
  put("config.json", '{"setupDone":true}');
  put("token", "secret");
  put("engine.json", "{}");
  return { root, put };
}
afterEach(() => {
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }));
});

describe("downloadDirs", () => {
  it("puts every entry under the data root, models and engines in their own folders", () => {
    const root = path.join(path.sep, "data", "desktop");
    expect(downloadDirs(root)).toEqual({
      models: path.join(root, "models"),
      engines: path.join(root, "engines"),
      legacyChatterbox: path.join(root, "chatterbox"),
      exports: path.join(root, "exports"),
      ocr: path.join(root, "IndexedDB"),
    });
  });
});

describe("measureDownloads", () => {
  it("adds up models, both engine folders and the caches", async () => {
    const { root } = dataRoot();
    expect(await measureDownloads(root)).toEqual({ modelsBytes: 100, enginesBytes: 55, cacheBytes: 30 });
  });
});

describe("removeDownloads", () => {
  it("deletes models, engines, exports and OCR data and keeps the library, voices, settings and token", async () => {
    const { root } = dataRoot();
    const report = await removeDownloads(root);
    for (const gone of ["models", "engines", "chatterbox", "exports", "IndexedDB"]) expect(existsSync(path.join(root, gone))).toBe(false);
    expect(readFileSync(path.join(root, "library/library.json"), "utf8")).toBe('{"docs":1}');
    expect(readFileSync(path.join(root, "voices/me.wav"), "utf8")).toBe("clone");
    expect(readFileSync(path.join(root, "config.json"), "utf8")).toBe('{"setupDone":true}');
    expect(readFileSync(path.join(root, "token"), "utf8")).toBe("secret");
    expect(existsSync(path.join(root, "engine.json"))).toBe(true);
    expect(report).toEqual({
      removed: [
        { kind: "models", bytes: 100 },
        { kind: "engines", bytes: 50 },
        { kind: "legacyChatterbox", bytes: 5 },
        { kind: "exports", bytes: 20 },
        { kind: "ocr", bytes: 10 },
      ],
      failed: [],
      freedBytes: 185,
    });
  });

  it("is safe when nothing is there", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sk-dl-"));
    roots.push(root);
    expect(await removeDownloads(root)).toEqual({ removed: [], failed: [], freedBytes: 0 });
  });

  it("refuses a models folder outside the data root and leaves it alone", async () => {
    const { root } = dataRoot();
    const outside = mkdtempSync(path.join(tmpdir(), "sk-out-"));
    roots.push(outside);
    writeFileSync(path.join(outside, "model.onnx"), "keep");
    const report = await removeDownloads(root, outside);
    expect(report.failed).toEqual([{ kind: "models", reason: "outside" }]);
    expect(existsSync(path.join(outside, "model.onnx"))).toBe(true);
    expect(existsSync(path.join(root, "engines"))).toBe(false); // the other entries are still removed
  });

  it("refuses the data root itself", async () => {
    const { root } = dataRoot();
    expect((await removeDownloads(root, root)).failed).toEqual([{ kind: "models", reason: "outside" }]);
    expect(existsSync(path.join(root, "library/library.json"))).toBe(true);
  });

  it("reports a folder it cannot delete and still removes the others", async () => {
    const { root } = dataRoot();
    // A locked folder cannot be produced portably (Node opens files with delete sharing on Windows), so rm fails on demand.
    const locked: typeof rm = (p, o) => (path.basename(String(p)) === "engines" ? Promise.reject(Object.assign(new Error("busy"), { code: "EBUSY" })) : rm(p, o));
    const report = await removeDownloads(root, undefined, locked);
    expect(report.failed).toEqual([{ kind: "engines", reason: "busy" }]);
    expect(existsSync(path.join(root, "engines"))).toBe(true);
    expect(existsSync(path.join(root, "models"))).toBe(false);
    expect(report.freedBytes).toBe(135);
  });
});
