import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { chatterboxDir } from "../src/chatterbox";

const roots: string[] = [];
const fresh = () => roots[roots.push(mkdtempSync(join(tmpdir(), "sk-cbx-"))) - 1]!;
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));

describe("chatterboxDir", () => {
  it("is engines/chatterbox for a new install", async () => {
    const root = fresh();
    expect(await chatterboxDir(root)).toBe(join(root, "engines", "chatterbox"));
  });

  it("keeps using the old chatterbox folder of an existing install", async () => {
    const root = fresh();
    mkdirSync(join(root, "chatterbox"));
    expect(await chatterboxDir(root)).toBe(join(root, "chatterbox"));
  });
});
