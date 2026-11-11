import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("treats a file that is not JSON as an empty history", async () => {
    const file = path.join(dir, "h.json");
    await writeFile(file, "{ half a fi");
    expect(await createHistoryStorage(file).load()).toEqual([]);
  });
});
