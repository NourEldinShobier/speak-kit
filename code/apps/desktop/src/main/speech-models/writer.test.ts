import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { LocalWriter, Transfers, WRITER_MODEL } from "@speakkit/engine";
import { WriterModels } from "./writer";

// A tiny stand-in for the catalog file: the real one is 3.3 GB.
const BODY = "writer-model";
const FILE = { ...WRITER_MODEL, bytes: BODY.length, sha256: createHash("sha256").update(BODY).digest("hex") };

let dir: string;
beforeEach(async () => void (dir = await mkdtemp(join(tmpdir(), "writer-models-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

function setup(fetchImpl?: typeof fetch, scan: string[] = []) {
  const changes: number[] = [];
  const transfers = new Transfers();
  const engine = new LocalWriter({ modelsDir: dir, model: FILE, ...(fetchImpl && { fetch: fetchImpl }) });
  const unload = vi.spyOn(engine, "unload");
  const files = new WriterModels({ modelsDir: dir, writer: engine, transfers, scanDirs: () => scan, changed: () => void changes.push(1), model: FILE });
  return { files, transfers, unload, changes };
}
const path = () => join(dir, "stt", FILE.file);

describe("the writer's model file", () => {
  it("is not installed at first, and its card shows the catalog entry", async () => {
    const { files } = setup();
    await files.init();
    expect(files.installed).toBe(false);
    expect(files.card()).toEqual({
      id: "writer-gemma-4-e2b",
      name: "Gemma 4 E2B",
      description: WRITER_MODEL.description,
      bytes: BODY.length,
      installed: false,
      diskBytes: 0,
      license: { name: "Apache 2.0", url: WRITER_MODEL.license.url },
    });
  });

  it("downloads into the models folder, checks it, and shows it as installed with its size on disk", async () => {
    const { files, changes } = setup((async () => new Response(BODY)) as typeof fetch);
    await files.init();
    await files.download();
    expect(await readFile(path(), "utf8")).toBe(BODY);
    expect(files.installed).toBe(true);
    expect(files.card()).toMatchObject({ installed: true, diskBytes: 12 });
    expect(files.card().failure).toBeUndefined();
    expect(changes.length).toBeGreaterThan(0);
  });

  it("shows a failed download with the host and keeps the part that arrived, then tries again from there", async () => {
    let calls = 0;
    const fetchImpl = (async (_url: string, init: { headers: Record<string, string> }) => {
      calls++;
      if (calls === 1) return new Response("", { status: 503 });
      expect(init.headers.Range).toBeUndefined();
      return new Response(BODY);
    }) as unknown as typeof fetch;
    const { files } = setup(fetchImpl);
    await files.download();
    expect(files.installed).toBe(false);
    expect(files.card().failure).toMatchObject({ host: "huggingface.co" });
    await files.download();
    expect(files.card().failure).toBeUndefined();
    expect(files.installed).toBe(true);
  });

  it("a cancelled download is not a failure", async () => {
    // Like the real fetch: a signal that already fired rejects at once.
    const hang = ((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        if (init.signal.aborted) return reject(init.signal.reason);
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      })) as unknown as typeof fetch;
    const { files, transfers } = setup(hang);
    const done = files.download();
    await vi.waitFor(() => expect(transfers.get(WRITER_MODEL.id)).toBeDefined());
    expect(files.card().transfer).toMatchObject({ state: "running", fraction: 0 });
    transfers.cancel(WRITER_MODEL.id);
    await done;
    expect(files.card().failure).toBeUndefined();
    expect(files.card().transfer).toBeUndefined();
    expect(files.installed).toBe(false);
  });

  it("deletes the file and its partial download, stops the model first, and reports the bytes freed", async () => {
    const { files, unload } = setup();
    await mkdir(join(dir, "stt"), { recursive: true });
    await writeFile(path(), BODY);
    await writeFile(`${path()}.part`, "abc");
    await files.refresh();
    expect(files.card().diskBytes).toBe(15);
    expect(await files.remove()).toBe(15);
    expect(unload).toHaveBeenCalledOnce();
    expect(files.installed).toBe(false);
    await expect(stat(path())).rejects.toThrow();
    await expect(stat(`${path()}.part`)).rejects.toThrow();
  });

  it("takes in a finished copy found in another folder, and ignores a file of the same name with other content", async () => {
    const other = await mkdtemp(join(tmpdir(), "writer-found-"));
    try {
      await writeFile(join(other, "copy.gguf"), BODY);
      await writeFile(join(other, "same-size.gguf"), "other-model!");
      const { files } = setup(undefined, [other]);
      await files.init();
      expect(files.installed).toBe(true);
      expect(await readFile(path(), "utf8")).toBe(BODY);
      expect(await readFile(join(other, "copy.gguf"), "utf8")).toBe(BODY);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("does not look for a copy when the file is already there", async () => {
    const { files } = setup(undefined, [join(dir, "nowhere")]);
    await mkdir(join(dir, "stt"), { recursive: true });
    await writeFile(path(), BODY);
    await files.init();
    expect(files.installed).toBe(true);
  });
});
