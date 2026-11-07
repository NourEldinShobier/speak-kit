import type { MenuItemConstructorOptions } from "electron";

/** The macOS menu bar (app, Edit, Window): without it Cmd+C, Cmd+V, Cmd+Q and Cmd+W do nothing. Windows and Linux have no menu bar. */
export function appMenuTemplate(platform: NodeJS.Platform): MenuItemConstructorOptions[] | null {
  return platform === "darwin" ? [{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }] : null;
}
