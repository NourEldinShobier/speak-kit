import { app, shell } from "electron";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Folder with the unpacked extension: bundled in resources when installed, the build output when running from source. */
async function extensionFolder(): Promise<string | null> {
  const dir = app.isPackaged ? path.join(process.resourcesPath, "extension") : path.resolve(here, "../../../extension/dist");
  return access(path.join(dir, "manifest.json")).then(
    () => dir,
    () => null,
  );
}

/** Browsers to try, in order: Chrome first, then Edge. `start` finds them through the Windows App Paths registry; `open -a` finds them on macOS. */
const BROWSERS = [
  { exe: "chrome", url: "chrome://extensions" },
  { exe: "msedge", url: "edge://extensions" },
] as const;

/** macOS application names of those browsers, for `open -a`. */
const MAC_APPS: Record<string, string> = { chrome: "Google Chrome", msedge: "Microsoft Edge" };

/** Opens the extensions page in the first browser that starts. Resolves with the browser used, or null when none did. */
export async function openExtensionsPage(run: (exe: string, url: string) => Promise<number>): Promise<string | null> {
  for (const b of BROWSERS) if ((await run(b.exe, b.url)) === 0) return b.exe;
  return null;
}

const runStart = (exe: string, url: string) =>
  new Promise<number>((resolve) => {
    const p =
      process.platform === "darwin" ? spawn("open", ["-a", MAC_APPS[exe] ?? exe, url], { stdio: "ignore" }) : spawn("cmd.exe", ["/c", "start", "", exe, url], { windowsHide: true, stdio: "ignore" });
    p.on("error", () => resolve(1));
    p.on("exit", (code) => resolve(code ?? 1));
  });

/**
 * The "Install the extension" action: shows the extension folder in Explorer (so it can be picked with Load unpacked) and opens
 * the browser's extensions page (`open` false skips both, for tests). Returns the folder, or null when this build has none.
 */
export async function installExtension(open = true): Promise<string | null> {
  const dir = await extensionFolder();
  if (!dir) return null;
  if (open) {
    shell.showItemInFolder(path.join(dir, "manifest.json"));
    await openExtensionsPage(runStart);
  }
  return dir;
}
