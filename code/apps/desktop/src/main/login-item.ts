import path from "node:path";
import { app } from "electron";

/** Windows reads an entry back as enabled only for the same path and args it was registered with, so set and get share these options. */
function options(startMinimized: boolean) {
  // The portable exe unpacks to a temp folder at every start; the entry must point at the exe the user launched.
  const portable = process.platform === "win32" ? process.env.PORTABLE_EXECUTABLE_FILE : undefined;
  return { ...(portable ? { path: portable } : {}), args: startMinimized ? ["--hidden"] : [] };
}

export function setLaunchAtLogin(on: boolean, startMinimized: boolean) {
  app.setLoginItemSettings({ openAtLogin: on, ...options(startMinimized) });
}

/** The real state: registered, not switched off in Windows Startup apps (executableWillLaunchAtLogin is Windows-only), and not waiting for approval in macOS System Settings > Login Items (status is macOS-only). */
export function isLaunchAtLogin(startMinimized: boolean) {
  const s = app.getLoginItemSettings(options(startMinimized));
  return s.openAtLogin && s.executableWillLaunchAtLogin !== false && s.status !== "requires-approval";
}

export function openedAtLogin(startMinimized: boolean) {
  return app.getLoginItemSettings(options(startMinimized)).wasOpenedAtLogin;
}

interface LaunchItem {
  path: string;
  enabled?: boolean;
}

const same = (a: string, b: string) => path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();

/** Entries for this program that point at another copy of it and that the person has not switched off in Windows Startup apps: what an update that moved the install folder leaves behind. */
export function staleEntries(items: readonly LaunchItem[], running: string): LaunchItem[] {
  const name = path.win32.basename(running).toLowerCase();
  return items.filter((i) => path.win32.basename(i.path).toLowerCase() === name && !same(i.path, running) && i.enabled !== false);
}

/** Windows starts whatever path the entry holds. When an update put the program somewhere else, this points the entry at the copy that is running (Windows only; returns whether it did). */
export function repairLoginItem(startMinimized: boolean): boolean {
  if (process.platform !== "win32") return false;
  const running = options(startMinimized).path ?? process.execPath;
  const items = (app.getLoginItemSettings().launchItems ?? []) as LaunchItem[];
  if (staleEntries(items, running).length === 0) return false;
  setLaunchAtLogin(true, startMinimized);
  return true;
}

/** Starts in the tray only after setup, when the person asked for it, and when something can bring the window back (a hidden or missing tray icon cannot). */
export function startsHidden(c: { setupDone: boolean; hideTrayIcon: boolean; startMinimized: boolean }, argv: readonly string[], trayMissing: boolean): boolean {
  if (!c.setupDone || c.hideTrayIcon || trayMissing) return false;
  return argv.includes("--hidden") || (c.startMinimized && openedAtLogin(true));
}
