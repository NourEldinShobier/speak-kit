import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { shell } from "electron";
import { createInstalledApps, type InstalledApps } from "./index";

const run = promisify(execFile);

/** The scan with the real file system, Electron's shortcut reader and macOS plutil. */
export function realInstalledApps(): InstalledApps {
  return createInstalledApps({
    platform: process.platform,
    now: Date.now,
    windows: {
      roots: () => [process.env["ProgramData"], process.env["APPDATA"]].filter((x): x is string => !!x).map((b) => path.join(b, "Microsoft", "Windows", "Start Menu", "Programs")),
      list: async (dir) => (await readdir(dir, { withFileTypes: true })).map((e) => ({ name: e.name, directory: e.isDirectory() })),
      target: (shortcut) => {
        try {
          return shell.readShortcutLink(shortcut).target;
        } catch {
          return "";
        }
      },
      join: path.join,
      pause: () => new Promise((done) => setImmediate(done)),
    },
    mac: {
      roots: () => ["/Applications", "/System/Applications", path.join(os.homedir(), "Applications")],
      list: (dir) => readdir(dir),
      bundleId: async (app) => {
        const { stdout } = await run("plutil", ["-convert", "json", "-o", "-", path.join(app, "Contents", "Info.plist")], { timeout: 5000 });
        const id = (JSON.parse(stdout) as { CFBundleIdentifier?: unknown }).CFBundleIdentifier;
        return typeof id === "string" && id ? id : null;
      },
      join: path.join,
    },
  });
}
