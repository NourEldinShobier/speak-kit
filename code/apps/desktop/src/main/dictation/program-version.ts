import { execFile } from "node:child_process";
import { isChromiumBrowser } from "./app-profile";
import { launchEnv } from "../system/launch-env";
import type { ForegroundInfo } from "./types";

export interface ProgramVersions {
  /** Starts reading the version of a browser ahead of the paste. Does nothing for other programs. */
  warm(fg: ForegroundInfo | null): void;
  /** The version of a Chromium browser, waiting for a read that is still running; undefined for other programs or when it cannot be read. Never rejects. */
  lookup(fg: ForegroundInfo | null): Promise<string | undefined>;
}

/** Remembers each process's version for the life of the process (a version cannot change under a running program). */
export function createProgramVersions(read: (fg: ForegroundInfo) => Promise<string | undefined>, timeoutMs = 2500): ProgramVersions {
  const seen = new Map<string, Promise<string | undefined>>();
  const lookup = (fg: ForegroundInfo | null): Promise<string | undefined> => {
    if (!fg || !isChromiumBrowser(fg.exe)) return Promise.resolve(undefined);
    const key = `${fg.pid}:${fg.exe}`;
    let p = seen.get(key);
    if (!p) {
      p = Promise.race([read(fg).catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs))]);
      seen.set(key, p);
      if (seen.size > 64) seen.delete(seen.keys().next().value!);
    }
    return p;
  };
  return { warm: (fg) => void lookup(fg), lookup };
}

const run = (file: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => execFile(file, args, { timeout: 2000, env: launchEnv(), windowsHide: true }, (err, out) => (err ? reject(err) : resolve(out.trim()))));

/** Windows: the product version of the program's main file. macOS: the version of the application bundle the process runs from. */
export async function readSystemVersion(fg: ForegroundInfo, platform: NodeJS.Platform = process.platform): Promise<string | undefined> {
  if (platform === "win32") {
    const out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${Math.trunc(fg.pid)}).MainModule.FileVersionInfo.ProductVersion`]);
    return out || undefined;
  }
  if (platform === "darwin") {
    const path = await run("ps", ["-p", String(Math.trunc(fg.pid)), "-o", "comm="]);
    const bundle = /^(.*?\.app)(\/|$)/.exec(path)?.[1];
    return bundle ? (await run("mdls", ["-raw", "-name", "kMDItemVersion", bundle])) || undefined : undefined;
  }
  return undefined;
}
