import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { DOWNLOAD_ENTRIES, KEPT_ENTRIES } from "./app-data";

const nsis = readFileSync(new URL("../../build/installer.nsh", import.meta.url), "utf8");

describe("Windows uninstaller", () => {
  it("removes exactly the download entries", () => {
    const removed = [...nsis.matchAll(/!insertmacro skRemoveDownload "\$R8" "([^"]+)"/g)].map((m) => m[1]);
    expect(removed).toEqual(["models", "exports", "IndexedDB"]);
    expect(removed).toEqual(Object.values(DOWNLOAD_ENTRIES));
  });

  it("never names an entry that holds the person's own data", () => {
    for (const kept of KEPT_ENTRIES) expect(nsis).not.toMatch(new RegExp(`skRemoveDownload "[$]R8" "${kept}"`));
  });

  it("skips the removal when the installer replaces an older version", () => {
    const body = nsis.slice(nsis.indexOf("!macro customUnInstall"));
    expect(body).toMatch(/\$\{ifNot\} \$\{isUpdated\}[\s\S]*skRemoveDownload/);
  });
});
