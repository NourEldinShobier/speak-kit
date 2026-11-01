import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { nodeBuild } from "../node-build";

const out = mkdtempSync(path.join(tmpdir(), "speakkit-bundle-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const bundle = async (name: string, testCode: boolean) => {
  await nodeBuild("src/main/index.ts", path.join(out, name), "es", "index.js", { testCode });
  return readFileSync(path.join(out, name, "index.js"), "utf8");
};

describe("main bundle", () => {
  it("contains the fake updater in the test build and not in the packaged one", async () => {
    expect(await bundle("test", true)).toContain("function fakeUpdater");
    const shipped = await bundle("shipped", false);
    expect(shipped).not.toContain("fakeUpdater");
    expect(shipped).not.toContain('emit("update-available"');
  });
});
