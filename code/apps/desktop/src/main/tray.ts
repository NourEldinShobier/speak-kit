import { Menu, Tray, type MenuItemConstructorOptions } from "electron";
import { trayIconState, trayMenuModel, trayTooltipFor, type TrayAction, type TrayContext, type TrayItem } from "../shared/tray";
import { trayIcon } from "./icon";

type TrayHandlers = Record<TrayAction, () => void>;

function menuTemplate(items: TrayItem[], run: TrayHandlers, mac: boolean): MenuItemConstructorOptions[] {
  return items.map((i): MenuItemConstructorOptions => {
    if (i.type === "separator") return { type: "separator" };
    if (i.type === "submenu") return { label: i.label, submenu: menuTemplate(i.items, run, mac) };
    return {
      label: i.label,
      enabled: i.enabled,
      ...(i.checked !== undefined ? { type: "checkbox" as const, checked: i.checked } : {}),
      ...(i.hint ? { accelerator: i.hint.replace("Ctrl", mac ? "Control" : "CommandOrControl"), registerAccelerator: false } : {}),
      click: () => run[i.action](),
    };
  });
}

/**
 * The tray icon, its short native menu (right click) and the main window (left click). Icon, tooltip and menu are rebuilt
 * only when what they show has changed.
 */
export function createTray(context: () => TrayContext, run: TrayHandlers) {
  const mac = process.platform === "darwin";
  const tray = new Tray(trayIcon("asleep"));
  let menu: Menu | null = null;
  let shown = "";
  let summary = "";

  tray.on("click", () => run.open());
  // macOS opens a context menu on the normal click, which would hide the window: show it on right click only.
  if (mac) tray.on("right-click", () => menu && tray.popUpContextMenu(menu));

  const refresh = () => {
    const c = context();
    const icon = trayIconState(c);
    const tip = trayTooltipFor(c);
    const items = trayMenuModel(c);
    const key = JSON.stringify([icon, tip, items]);
    if (key === shown) return;
    shown = key;
    summary = `${icon}|${tip}`;
    tray.setImage(trayIcon(icon));
    tray.setToolTip(tip);
    const template = menuTemplate(items, run, mac);
    menu = Menu.buildFromTemplate(template);
    if (!mac) tray.setContextMenu(menu);
  };
  refresh();

  return {
    refresh,
    /** For tests: the native menu cannot be clicked from Playwright. */
    items: () => menu?.items ?? [],
    summary: () => summary,
    dispose: () => {
      tray.destroy();
    },
  };
}
