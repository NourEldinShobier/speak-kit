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
  let tray: Tray | null = null;
  let menu: Menu | null = null;
  let shown = "";
  let summary = "";

  const build = () => {
    const t = new Tray(trayIcon("asleep"));
    t.on("click", () => run.open());
    // macOS opens a context menu on the normal click, which would hide the window: show it on right click only.
    if (mac) t.on("right-click", () => menu && t.popUpContextMenu(menu));
    tray = t;
    shown = "";
  };

  const refresh = () => {
    if (!tray) return;
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
    menu = Menu.buildFromTemplate(menuTemplate(items, run, mac));
    if (!mac) tray.setContextMenu(menu);
  };
  build();
  refresh();
  return {
    refresh,
    /** The icon can be hidden in Settings; showing it again rebuilds it from the current state. */
    setVisible: (on: boolean) => {
      if (on && !tray) {
        build();
        refresh();
      } else if (!on && tray) {
        tray.destroy();
        tray = null;
      }
    },
    /** For tests: the native menu cannot be clicked from Playwright. */
    items: () => menu?.items ?? [],
    summary: () => summary,
    dispose: () => {
      tray?.destroy();
      tray = null;
    },
  };
}
