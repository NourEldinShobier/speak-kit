import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { removeLeftovers } from "../src/leftovers";

it("deletes the engine folders, cloned voices and engine.json, and leaves everything else", async () => {
  const dir = mkdtempSync(join(tmpdir(), "speakkit-leftovers-"));
  for (const folder of ["engines/chatterbox/env", "chatterbox", "voices", "models", "library"]) {
    mkdirSync(join(dir, folder), { recursive: true });
    writeFileSync(join(dir, folder, "file"), "x");
  }
  writeFileSync(join(dir, "engine.json"), '{"active":"chatterbox"}');
  writeFileSync(join(dir, "token"), "t");
  await removeLeftovers(dir);
  expect(["engines/chatterbox", "chatterbox", "voices", "engine.json"].map((p) => existsSync(join(dir, p)))).toEqual([false, false, false, false]);
  expect(["models/file", "library/file", "token"].map((p) => existsSync(join(dir, p)))).toEqual([true, true, true]);
});

it("does not fail when there is nothing to delete or the folder does not exist", async () => {
  await expect(removeLeftovers(join(tmpdir(), "speakkit-no-such-folder"))).resolves.toBeUndefined();
});
