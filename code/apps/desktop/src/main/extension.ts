import { app, shell } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Folder with the unpacked extension: bundled in resources when installed, the build output when running from source. */
function extensionFolder(): string | null {
  const dir = app.isPackaged ? path.join(process.resourcesPath, "extension") : path.resolve(here, "../../../extension/dist");
  return existsSync(path.join(dir, "manifest.json")) ? dir : null;
}

/** Browsers to try, in order: Chrome first, then Edge. `start` finds them through the Windows App Paths registry. */
const BROWSERS = [
  { exe: "chrome", url: "chrome://extensions" },
  { exe: "msedge", url: "edge://extensions" },
] as const;

/** Opens the extensions page in the first browser that starts. Resolves with the browser used, or null when none did. */
export async function openExtensionsPage(run: (exe: string, url: string) => Promise<number>): Promise<string | null> {
  for (const b of BROWSERS) if ((await run(b.exe, b.url)) === 0) return b.exe;
  return null;
}

const runStart = (exe: string, url: string) =>
  new Promise<number>((resolve) => {
    const p = spawn("cmd.exe", ["/c", "start", "", exe, url], { windowsHide: true, stdio: "ignore" });
    p.on("error", () => resolve(1));
    p.on("exit", (code) => resolve(code ?? 1));
  });

/**
 * The "Install the extension" action: shows the extension folder in Explorer (so it can be picked with Load unpacked) and opens
 * the browser's extensions page (`open` false skips both, for tests). Returns the folder, or null when this build has none.
 */
export async function installExtension(open = true): Promise<string | null> {
  const dir = extensionFolder();
  if (!dir) return null;
  if (open) {
    shell.showItemInFolder(path.join(dir, "manifest.json"));
    await openExtensionsPage(runStart);
  }
  return dir;
}
