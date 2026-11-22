import path from "node:path";
import { app } from "electron";

/** Windows reads an entry back as enabled only for the same path and args it was registered with, so set and get share these options. */
function options() {
  // The portable exe unpacks to a temp folder at every start; the entry must point at the exe the user launched.
  const portable = process.platform === "win32" ? process.env.PORTABLE_EXECUTABLE_FILE : undefined;
  return { ...(portable ? { path: portable } : {}), args: ["--hidden"] };
}

/** A launch at login always starts in the tray: the entry carries --hidden. */
export function setLaunchAtLogin(on: boolean) {
  app.setLoginItemSettings({ openAtLogin: on, ...options() });
}

/** The real state: registered, not switched off in Windows Startup apps (executableWillLaunchAtLogin is Windows-only), and not waiting for approval in macOS System Settings > Login Items (status is macOS-only). */
export function isLaunchAtLogin() {
  const s = app.getLoginItemSettings(options());
  return s.openAtLogin && s.executableWillLaunchAtLogin !== false && s.status !== "requires-approval";
}

function openedAtLogin() {
  return app.getLoginItemSettings(options()).wasOpenedAtLogin;
}

interface LaunchItem {
  path: string;
  args?: string[];
  enabled?: boolean;
}

const same = (a: string, b: string) => path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();

/** Entries for this program that point at another copy of it, or that open the window instead of starting in the tray (older versions did), and that the person has not switched off in Windows Startup apps: what an update leaves behind. */
export function staleEntries(items: readonly LaunchItem[], running: string): LaunchItem[] {
  const name = path.win32.basename(running).toLowerCase();
  return items.filter((i) => path.win32.basename(i.path).toLowerCase() === name && (!same(i.path, running) || !i.args?.includes("--hidden")) && i.enabled !== false);
}

/** Windows starts whatever path the entry holds. When an update put the program somewhere else, this points the entry at the copy that is running, starting in the tray (Windows only; returns whether it did). */
export function repairLoginItem(): boolean {
  if (process.platform !== "win32") return false;
  const running = options().path ?? process.execPath;
  const items = (app.getLoginItemSettings().launchItems ?? []) as LaunchItem[];
  if (staleEntries(items, running).length === 0) return false;
  setLaunchAtLogin(true);
  return true;
}

/** A launch at login starts in the tray, but only after setup and when something can bring the window back (a missing tray icon cannot). A normal launch shows the window. */
export function startsHidden(c: { setupDone: boolean }, argv: readonly string[], trayMissing: boolean): boolean {
  if (!c.setupDone || trayMissing) return false;
  return argv.includes("--hidden") || openedAtLogin();
}
