import { app } from "electron";

/** Windows reads an entry back as enabled only for the same path and args it was registered with, so set and get share these options. */
function options(startMinimized: boolean) {
  // The portable exe unpacks to a temp folder at every start; the entry must point at the exe the user launched.
  const path = process.platform === "win32" ? process.env.PORTABLE_EXECUTABLE_FILE : undefined;
  return { ...(path ? { path } : {}), args: startMinimized ? ["--hidden"] : [] };
}

export function setLaunchAtLogin(on: boolean, startMinimized: boolean) {
  app.setLoginItemSettings({ openAtLogin: on, ...options(startMinimized) });
}

/** The real state: registered, and not switched off in Windows Startup apps (executableWillLaunchAtLogin is Windows-only). */
export function isLaunchAtLogin(startMinimized: boolean) {
  const s = app.getLoginItemSettings(options(startMinimized));
  return s.openAtLogin && s.executableWillLaunchAtLogin !== false;
}

export function openedAtLogin(startMinimized: boolean) {
  return app.getLoginItemSettings(options(startMinimized)).wasOpenedAtLogin;
}
