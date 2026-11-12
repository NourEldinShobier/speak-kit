import { Menu, Tray, type MenuItemConstructorOptions } from "electron";
import { trayIconState, trayMenuModel, trayTooltipFor, type TrayAction, type TrayContext, type TrayItem } from "../shared/tray";
import { trayIcon } from "./icon";

type TrayHandlers = Record<TrayAction, () => void>;

type MenuModel = TrayItem[];
type ModelRows = Extract<MenuModel[number], { type: "models" }>["rows"];

const submenuOf = (rows: ModelRows, run: TrayHandlers, switchTo: (id: string) => void): MenuItemConstructorOptions[] =>
  rows.map((r): MenuItemConstructorOptions => {
    if (r.type === "header") return { label: r.label, enabled: false };
    if (r.type === "model") return { label: r.label, type: "radio", checked: r.checked, enabled: r.enabled, click: () => switchTo(r.id) };
    return { label: r.label, click: () => run[r.action]() };
  });

interface TemplateArgs {
  items: MenuModel;
  run: TrayHandlers;
  mac: boolean;
  switchTo: (id: string) => void;
}

function menuTemplate({ items, run, mac, switchTo }: TemplateArgs): MenuItemConstructorOptions[] {
  return items.map((i): MenuItemConstructorOptions => {
    if (i.type === "separator") return { type: "separator" };
    if (i.type === "submenu") return { label: i.label, submenu: menuTemplate({ items: i.items, run, mac, switchTo }) };
    if (i.type === "models") return { label: i.label, submenu: submenuOf(i.rows, run, switchTo) };
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
export function createTray(context: () => TrayContext, run: TrayHandlers, switchTo: (id: string) => void = () => {}) {
  const mac = process.platform === "darwin";
  let tray: Tray | null = null;
  let menu: Menu | null = null;
  let shown = "";
  let summary = "";

  /** The system refused to create the icon (no notification area, a broken shell): the app goes on without it and says so through `failed`. */
  let failed = false;
  const build = () => {
    try {
      const t = new Tray(trayIcon("asleep"));
      t.on("click", () => run.open());
      // macOS opens a context menu on the normal click, which would hide the window: show it on right click only.
      if (mac) t.on("right-click", () => menu && t.popUpContextMenu(menu));
      tray = t;
      failed = false;
    } catch {
      tray = null;
      failed = true;
    }
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
    const template = menuTemplate({ items, run, mac, switchTo });
    menu = Menu.buildFromTemplate(template);
    if (!mac) tray.setContextMenu(menu);
  };
  build();
  refresh();
  return {
    refresh,
    /** The icon was wanted and could not be created: nothing can reopen a hidden window. */
    failed: () => failed,
    /** The icon can be hidden in Settings; showing it again rebuilds it from the current state. */
    setVisible: (on: boolean) => {
      if (on && !tray) {
        build();
        refresh();
      } else if (!on) {
        failed = false;
        tray?.destroy();
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
