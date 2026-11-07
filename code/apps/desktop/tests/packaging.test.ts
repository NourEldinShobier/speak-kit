import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

const desktop = path.resolve(import.meta.dirname, "..");
const builder = readFileSync(path.join(desktop, "electron-builder.yml"), "utf8");

describe("packaged Chatterbox sidecar", () => {
  it("electron-builder ships chatterbox_sidecar.py into resources/chatterbox", () => {
    const entry = /- from: (\S*sidecar)\n\s+to: chatterbox\n\s+filter: \["\*\.py"\]/.exec(builder);
    expect(entry, "extraResources entry for the sidecar").not.toBeNull();
    expect(existsSync(path.join(desktop, entry![1]!, "chatterbox_sidecar.py"))).toBe(true);
  });

  it("the packaged smoke test fails when the script is missing", () => {
    const smoke = readFileSync(path.join(desktop, "scripts/smoke-packaged.mjs"), "utf8");
    expect(smoke).toContain('check("bundles the Chatterbox sidecar script"');
    expect(smoke).toContain("chatterbox/chatterbox_sidecar.py");
    const installer = readFileSync(path.join(desktop, "scripts/smoke-installer.mjs"), "utf8");
    expect(installer).toContain("resources/chatterbox/chatterbox_sidecar.py");
  });
});
