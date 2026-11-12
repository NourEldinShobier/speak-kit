import { app } from "electron";
import path from "node:path";

/** Windows reads an entry back as enabled only for the same path and args it was registered with, so set and get share these options. */
function options(startMinimized: boolean) {
  // The portable exe unpacks to a temp folder at every start; the entry must point at the exe the user launched.
  const path = process.platform === "win32" ? process.env.PORTABLE_EXECUTABLE_FILE : undefined;
  return { ...(path ? { path } : {}), args: startMinimized ? ["--hidden"] : [] };
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

const sameFile = (a: string, b: string) => path.win32.normalize(a).toLowerCase() === path.win32.normalize(b).toLowerCase();

/** An update or a moved install leaves the Windows Run entry pointing at the old exe, and the app then starts nothing at login. Re-registers the entry for the exe that runs now; true when it did. */
export function repairLaunchAtLogin(startMinimized: boolean): boolean {
  if (process.platform !== "win32") return false; // macOS registers the app bundle, not a path
  const exe = options(startMinimized).path ?? process.execPath;
  const stale = app.getLoginItemSettings().launchItems?.some((i) => i.enabled && !sameFile(i.path, exe));
  if (stale) setLaunchAtLogin(true, startMinimized);
  return !!stale;
}
