import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createHistoryStorage } from "./history-storage";

let dir = "";
beforeEach(async () => void (dir = await mkdtemp(path.join(tmpdir(), "speakkit-history-"))));
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("history storage", () => {
  it("is an empty history when the file does not exist yet", async () => {
    expect(await createHistoryStorage(path.join(dir, "h.json")).load()).toEqual([]);
  });

  it("returns what was saved, creating the folder", async () => {
    const s = createHistoryStorage(path.join(dir, "deep", "h.json"));
    await s.save([{ id: "a", text: "hi" }]);
    expect(await s.load()).toEqual([{ id: "a", text: "hi" }]);
  });

  it("leaves no temporary file behind", async () => {
    const file = path.join(dir, "h.json");
    await createHistoryStorage(file).save([1]);
    await expect(readFile(`${file}.tmp`)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("[1]");
  });

  it("treats a file that is not JSON as an empty history and keeps a copy of it first", async () => {
    const file = path.join(dir, "h.json");
    await writeFile(file, "{ half a fi");
    expect(await createHistoryStorage(file, () => 5).load()).toEqual([]);
    expect(await readFile(path.join(dir, "h.unreadable-5.json"), "utf8")).toBe("{ half a fi");
  });

  it("copies a file on request without touching the original, and does not fail when there is nothing to copy", async () => {
    const file = path.join(dir, "h.json");
    const s = createHistoryStorage(file, () => 9);
    await s.preserve?.("newer");
    expect(await readdir(dir)).toEqual([]);
    await writeFile(file, '{"version":9}');
    await s.preserve?.("newer");
    expect(await readFile(file, "utf8")).toBe('{"version":9}');
    expect(await readFile(path.join(dir, "h.newer-9.json"), "utf8")).toBe('{"version":9}');
  });

  it("does not overwrite an earlier copy made at another time", async () => {
    const file = path.join(dir, "h.json");
    await writeFile(file, "bad");
    let t = 1;
    const s = createHistoryStorage(file, () => t++);
    await s.preserve?.("unreadable");
    await s.preserve?.("unreadable");
    expect((await readdir(dir)).sort()).toEqual(["h.json", "h.unreadable-1.json", "h.unreadable-2.json"]);
  });
});
