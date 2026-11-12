import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { nodeFs } from "../src";

let dir = "";
beforeAll(async () => void (dir = await mkdtemp(path.join(tmpdir(), "sk-tr-"))));
afterAll(() => rm(dir, { recursive: true, force: true }));

test("writes atomically into new folders, reads, appends, renames, removes", async () => {
  const fs = nodeFs();
  const file = path.join(dir, "a", "b", "f.txt");
  expect(await fs.read(file)).toBeUndefined();
  expect(await fs.exists(file)).toBe(false);
  await fs.write(file, "one");
  expect(new TextDecoder().decode(await fs.read(file))).toBe("one");
  await fs.write(file, new TextEncoder().encode("two"));
  await fs.append(file, new TextEncoder().encode("+more"));
  expect(new TextDecoder().decode(await fs.read(file))).toBe("two+more");
  expect(await readdir(path.dirname(file))).toEqual(["f.txt"]); // no temporary file is left
  const moved = path.join(dir, "c", "g.txt");
  await fs.rename(file, moved);
  expect(await fs.exists(file)).toBe(false);
  expect(await fs.exists(moved)).toBe(true);
  await fs.remove(moved);
  await fs.remove(moved); // already gone: fine
  expect(await fs.exists(moved)).toBe(false);
  await fs.append(path.join(dir, "d", "new.raw"), new Uint8Array([1, 2]));
  expect([...(await fs.read(path.join(dir, "d", "new.raw")))!]).toEqual([1, 2]);
});

test("a read error other than a missing file is thrown, and a failed write leaves no temporary file", async () => {
  const fs = nodeFs();
  await expect(fs.read(dir)).rejects.toThrow(); // a folder is not a file
  const blocker = path.join(dir, "blocker");
  await writeFile(blocker, "x");
  await expect(fs.write(path.join(blocker, "inside.txt"), "y")).rejects.toThrow();
  expect((await readdir(dir)).filter((n) => n.endsWith(".tmp"))).toEqual([]);
});
