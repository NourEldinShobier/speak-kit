import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { journalFs, storeFs } from "./fs-adapters";

const dirs: string[] = [];
const temp = async () => {
  const d = await mkdtemp(path.join(tmpdir(), "capfs-"));
  dirs.push(d);
  return d;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("capture file adapters", () => {
  it("reads a missing file as undefined but throws for any other failure", async () => {
    const d = await temp();
    expect(await storeFs.read(path.join(d, "none.json"))).toBeUndefined();
    await mkdir(path.join(d, "folder"));
    await expect(storeFs.read(path.join(d, "folder"))).rejects.toThrow();
    await expect(journalFs.read(path.join(d, "folder"))).rejects.toThrow();
  });
  it("writes whole files, replaces them, and leaves no temp file behind", async () => {
    const d = await temp();
    const f = path.join(d, "sub", "index.json");
    await storeFs.write(f, "one");
    await storeFs.write(f, "two");
    expect(await readFile(f, "utf8")).toBe("two");
    expect(await readdir(path.dirname(f))).toEqual(["index.json"]);
  });
  it("moves a damaged index aside under a new name and keeps its content", async () => {
    const d = await temp();
    const f = path.join(d, "index.json");
    await writeFile(f, "{garbage");
    await storeFs.moveAside!(f);
    const names = await readdir(d);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^index\.json\.damaged-\d+$/);
    expect(await readFile(path.join(d, names[0]!), "utf8")).toBe("{garbage");
  });
});
