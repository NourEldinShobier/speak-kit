import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { adoptFound, deleteModelFiles, diskUse, findModelsOnDisk, importModelFile, importedAsModel, inspectModelFile, loadImported, missingImported, readHeader, removeImported } from "../src";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "model-files-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

const MB = 1_000_000;
const ggml = (n: number, fill = 7) => Buffer.concat([Buffer.from("lmgg", "latin1"), Buffer.alloc(n - 4, fill)]);
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const put = async (name: string, data: Buffer, dir = root) => {
  await mkdir(dir, { recursive: true });
  const p = join(dir, name);
  await writeFile(p, data);
  return p;
};

describe("inspectModelFile", () => {
  it("accepts a ggml header and fingerprints the whole file", async () => {
    const data = ggml(MB + 10);
    const r = await inspectModelFile(await put("my-model.bin", data));
    expect(r).toEqual({ ok: true, header: "ggml", bytes: MB + 10, sha256: sha(data), id: `custom-${sha(data).slice(0, 12)}`, name: "my-model" });
  });

  it("accepts a GGUF header", async () => {
    const p = await put("m.gguf", Buffer.concat([Buffer.from("GGUF"), Buffer.alloc(MB)]));
    expect(await readHeader(p)).toBe("gguf");
  });

  it("rejects a file that is not a model and says nothing was copied", async () => {
    const r = await inspectModelFile(await put("photo.bin", Buffer.alloc(MB + 1, 1)));
    expect(r).toEqual({ ok: false, reason: "not-a-model", message: "That file is not a Whisper model (its header is wrong). Nothing was copied." });
  });

  it("rejects an empty or tiny file and a missing path", async () => {
    expect((await inspectModelFile(await put("tiny.bin", ggml(100)))).ok).toBe(false);
    expect(await inspectModelFile(await put("empty.bin", Buffer.alloc(0)))).toMatchObject({ ok: false, reason: "too-small" });
    expect(await inspectModelFile(join(root, "nope.bin"))).toMatchObject({ ok: false, reason: "not-found" });
    expect(await inspectModelFile(root)).toMatchObject({ ok: false, reason: "not-found" });
  });

  it("a file shorter than the header has no header", async () => {
    expect(await readHeader(await put("short.bin", Buffer.from("lm")))).toBeUndefined();
  });
});

describe("importModelFile", () => {
  const models = () => join(root, "models");

  it("copies a valid file under its fingerprint and registers it; the original stays", async () => {
    const data = ggml(MB + 1);
    const source = await put("mine.bin", data, join(root, "src"));
    const r = await importModelFile({ modelsDir: models(), source, name: "My model", kind: "english", now: () => 5 });
    if (!r.ok) throw new Error(r.message);
    const id = `custom-${sha(data).slice(0, 12)}`;
    expect(r.model).toEqual({ id, name: "My model", file: `${id}.bin`, sha256: sha(data), bytes: MB + 1, engine: "whisper", kind: "english", addedAt: 5, sourcePath: source });
    expect(r.alreadyThere).toBe(false);
    expect((await readFile(join(models(), "stt", `${id}.bin`))).equals(data)).toBe(true);
    expect((await stat(source)).size).toBe(MB + 1);
    expect(await loadImported(models())).toEqual([r.model]);
  });

  it("copies nothing for an invalid file", async () => {
    const source = await put("bad.bin", Buffer.alloc(MB + 1, 9), join(root, "src"));
    const r = await importModelFile({ modelsDir: models(), source });
    expect(r).toMatchObject({ ok: false, reason: "not-a-model" });
    await expect(stat(join(models(), "stt"))).rejects.toThrow();
  });

  it("importing the same content twice changes nothing", async () => {
    const source = await put("a.bin", ggml(MB + 2), join(root, "src"));
    const first = await importModelFile({ modelsDir: models(), source, now: () => 1 });
    const again = await importModelFile({ modelsDir: models(), source: await put("renamed.bin", ggml(MB + 2), join(root, "src")), now: () => 2 });
    expect(again).toMatchObject({ ok: true, alreadyThere: true });
    expect(await loadImported(models())).toHaveLength(1);
    expect(first.ok && again.ok && again.model.addedAt).toBe(1);
  });

  it("the missing-file state: a lost copy is reported and pointing at the same file restores it, another file is refused", async () => {
    const data = ggml(MB + 3);
    const source = await put("a.bin", data, join(root, "src"));
    const r = await importModelFile({ modelsDir: models(), source });
    if (!r.ok) throw new Error("import failed");
    await rm(join(models(), "stt", r.model.file));
    expect((await missingImported(models(), await loadImported(models()))).map((m) => m.id)).toEqual([r.model.id]);

    const other = await put("other.bin", ggml(MB + 3, 8), join(root, "src"));
    expect(await importModelFile({ modelsDir: models(), source: other, expectSha256: r.model.sha256 })).toMatchObject({ ok: false, reason: "different-file" });

    const back = await importModelFile({ modelsDir: models(), source, expectSha256: r.model.sha256 });
    expect(back).toMatchObject({ ok: true, alreadyThere: false });
    expect(await missingImported(models(), await loadImported(models()))).toEqual([]);
  });

  it("a truncated copy counts as missing", async () => {
    const source = await put("a.bin", ggml(MB + 4), join(root, "src"));
    const r = await importModelFile({ modelsDir: models(), source });
    if (!r.ok) throw new Error("import failed");
    await writeFile(join(models(), "stt", r.model.file), Buffer.alloc(10));
    expect(await missingImported(models(), [r.model])).toHaveLength(1);
  });

  it("removing drops the registry entry; a broken registry reads as empty", async () => {
    const source = await put("a.bin", ggml(MB + 5), join(root, "src"));
    const r = await importModelFile({ modelsDir: models(), source });
    if (!r.ok) throw new Error("import failed");
    await removeImported(models(), r.model.id);
    expect(await loadImported(models())).toEqual([]);
    await writeFile(join(models(), "stt", "imported.json"), "{not json");
    expect(await loadImported(models())).toEqual([]);
    await writeFile(join(models(), "stt", "imported.json"), JSON.stringify([{ id: "../evil", file: "x", sha256: "y", bytes: 1 }, 5]));
    expect(await loadImported(models())).toEqual([]);
  });

  it("two imports at the same time both end up in the registry", async () => {
    const sources = await Promise.all([1, 2, 3, 4].map((n) => put(`m${n}.bin`, ggml(MB + 10 + n, n), join(root, "src"))));
    const results = await Promise.all(sources.map((source) => importModelFile({ modelsDir: models(), source })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await loadImported(models())).toHaveLength(4);
    await Promise.all(results.map((r) => (r.ok ? removeImported(models(), r.model.id) : undefined)));
    expect(await loadImported(models())).toEqual([]);
  });

  it("an unreadable registry is set aside as .bak, so the next import does not destroy the list", async () => {
    await mkdir(join(models(), "stt"), { recursive: true });
    await writeFile(join(models(), "stt", "imported.json"), "{broken");
    expect(await loadImported(models())).toEqual([]);
    expect(await readFile(join(models(), "stt", "imported.json.bak"), "utf8")).toBe("{broken");
    const r = await importModelFile({ modelsDir: models(), source: await put("a.bin", ggml(MB + 20), join(root, "src")) });
    expect(r.ok).toBe(true);
    expect(await readFile(join(models(), "stt", "imported.json.bak"), "utf8")).toBe("{broken");
  });

  it("describes an imported model for the catalog: no address, English-only or multilingual", () => {
    const base = { id: "custom-0123456789ab", name: "Mine", file: "f.bin", sha256: "s", bytes: 1, engine: "whisper", addedAt: 1 } as const;
    expect(importedAsModel({ ...base, kind: "english" })).toMatchObject({ url: "", languages: ["en"], detects: false, origin: "custom", tag: "Yours" });
    const multi = importedAsModel({ ...base, kind: "multilingual" });
    expect(multi.detects).toBe(true);
    expect(multi.languages).toContain("lt");
  });
});

describe("findModelsOnDisk", () => {
  it("finds a file that is exactly a catalog model and ignores one with the right name but another content", async () => {
    const good = ggml(2000);
    const bad = ggml(2000, 1);
    const catalog = [
      { id: "large-v3-turbo-q5_0" as const, file: "a.bin", url: "", sha256: sha(good), bytes: 2000 },
      { id: "parakeet-tdt-0.6b-v3-q4_0" as const, file: "b.bin", url: "", sha256: sha(ggml(3000)), bytes: 3000 },
    ];
    const downloads = join(root, "Downloads");
    const p = await put("renamed-copy.bin", good, downloads);
    await put("b.bin", Buffer.alloc(3000, 5), downloads); // same size, wrong content
    await put("noise.bin", bad, downloads);
    expect(await findModelsOnDisk([downloads, join(root, "missing-folder")], catalog)).toEqual([{ id: "large-v3-turbo-q5_0", path: p }]);
  });

  it("returns nothing for empty or absent folders and does not modify what it scans", async () => {
    expect(await findModelsOnDisk([root], [{ id: "large-v3-turbo-q5_0", file: "a", url: "", sha256: "x", bytes: 1 }])).toEqual([]);
  });

  it("adopting copies the file under the catalog name and leaves the original", async () => {
    const data = ggml(2000);
    const p = await put("found.bin", data, join(root, "elsewhere"));
    await adoptFound(join(root, "models"), { id: "large-v3-turbo-q5_0", path: p }, { file: "a.bin", url: "", sha256: sha(data), bytes: 2000 });
    expect((await readFile(join(root, "models", "stt", "a.bin"))).equals(data)).toBe(true);
    expect((await stat(p)).size).toBe(2000);
    await adoptFound(join(root, "models"), { id: "large-v3-turbo-q5_0", path: join(root, "models", "stt", "a.bin") }, { file: "a.bin", url: "", sha256: sha(data), bytes: 2000 }); // already there: no-op
  });

  it("a found file that changed since the scan is not adopted and leaves no partial copy", async () => {
    const p = await put("found.bin", ggml(2000, 3), join(root, "elsewhere"));
    await expect(adoptFound(join(root, "models"), { id: "large-v3-turbo-q5_0", path: p }, { file: "a.bin", url: "", sha256: sha(ggml(2000)), bytes: 2000 })).rejects.toThrow(
      "changed while it was copied",
    );
    await expect(stat(join(root, "models", "stt", "a.bin"))).rejects.toThrow();
    await expect(stat(join(root, "models", "stt", "a.bin.part"))).rejects.toThrow();
  });
});

describe("disk use and delete", () => {
  it("counts only our folder, partial downloads included", async () => {
    const stt = join(root, "stt");
    await put("a.bin", Buffer.alloc(100), stt);
    await put("b.bin.part", Buffer.alloc(40), stt);
    await put("a.bin", Buffer.alloc(9999), join(root, "other")); // somewhere else: not counted
    const use = await diskUse(root, [
      { id: "large-v3-turbo-q5_0", file: "a.bin" },
      { id: "parakeet-tdt-0.6b-v3-q4_0", file: "b.bin" },
    ]);
    expect(use).toEqual({ perModel: { "large-v3-turbo-q5_0": 100, "parakeet-tdt-0.6b-v3-q4_0": 40 }, total: 140 });
  });

  it("deleting frees the file and its partial and reports the bytes", async () => {
    const stt = join(root, "stt");
    await put("a.bin", Buffer.alloc(100), stt);
    await put("a.bin.part", Buffer.alloc(5), stt);
    expect(await deleteModelFiles(root, { file: "a.bin" })).toBe(105);
    await expect(stat(join(stt, "a.bin"))).rejects.toThrow();
    expect(await deleteModelFiles(root, { file: "a.bin" })).toBe(0);
  });

  it("refuses to touch anything outside the models folder", async () => {
    const mine = await put("precious.txt", Buffer.from("keep"), join(root, "docs"));
    await expect(deleteModelFiles(join(root, "models"), { file: "../../docs/precious.txt" })).rejects.toThrow("outside the models folder");
    await expect(deleteModelFiles(join(root, "models"), { file: ".." })).rejects.toThrow("outside the models folder");
    await expect(deleteModelFiles(join(root, "models"), { file: "" })).rejects.toThrow("outside the models folder");
    expect((await stat(mine)).size).toBe(4);
  });
});
