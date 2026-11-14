import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { app, dialog, shell, type BrowserWindow } from "electron";
import type { Hardware } from "@speakkit/engine";
import { probeHardware, type RunProgram } from "./hardware-probe";
import { at } from "../../shared/i18n";
import "../../shared/i18n/packs/main";

const run: RunProgram = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });

export const probeThisComputer = (): Promise<Hardware> =>
  probeHardware({ platform: process.platform, arch: process.arch, cores: os.availableParallelism(), memoryBytes: os.totalmem(), osRelease: os.release(), run });

/** The operating system's proxy page. Speak Kit uses the system proxy settings, so this is where the person fixes a blocked download. */
export const PROXY_SETTINGS: Record<string, string | undefined> = {
  win32: "ms-settings:network-proxy",
  darwin: "x-apple.systempreferences:com.apple.Network-Settings.extension",
};

export const openProxySettings = async (): Promise<void> => {
  const url = PROXY_SETTINGS[process.platform];
  if (url) await shell.openExternal(url);
};

/** Working set (Windows) or resident size (macOS) of a process in megabytes. */
export async function memoryOf(pid: number): Promise<number | undefined> {
  try {
    if (process.platform === "win32") {
      const out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${Math.trunc(pid)}).WorkingSet64`], 10_000);
      return Math.round(Number(out.trim()) / 1024 / 1024);
    }
    const out = await run("ps", ["-o", "rss=", "-p", String(Math.trunc(pid))], 5_000);
    return Math.round(Number(out.trim()) / 1024);
  } catch {
    return undefined;
  }
}

/** Where models people downloaded for other tools often sit. Only these folders are looked at, and only their top level. */
export const scanDirs = (): string[] => {
  const home = os.homedir();
  const dirs = [app.getPath("downloads"), app.getPath("documents"), app.getPath("desktop"), path.join(home, ".cache", "whisper"), path.join(home, "models"), path.join(home, "Models")];
  if (process.platform === "win32" && process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, "whisper"), path.join(process.env.LOCALAPPDATA, "models"));
  if (process.platform === "darwin") dirs.push(path.join(home, "Library", "Application Support", "whisper"));
  return [...new Set(dirs)];
};

export const pickModelFile = async (parent: BrowserWindow | null, title: string): Promise<string | undefined> => {
  const options: Electron.OpenDialogOptions = {
    title,
    properties: ["openFile"],
    filters: [
      { name: at("filter.speechModel"), extensions: ["bin", "gguf"] },
      { name: at("filter.allFiles"), extensions: ["*"] },
    ],
  };
  const r = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  return r.canceled ? undefined : r.filePaths[0];
};

export const openFolder = async (dir: string): Promise<void> => void (await shell.openPath(dir));
