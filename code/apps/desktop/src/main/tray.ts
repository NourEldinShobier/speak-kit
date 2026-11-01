import { Menu, Tray, type MenuItemConstructorOptions } from "electron";
import { trayIconState, trayMenuModel, trayTooltipFor, type TrayAction, type TrayContext } from "../shared/tray";
import { aboveTray, FloatWindow } from "./windows";
import { trayIcon } from "./icon";
import type { Ctx } from "./context";

type TrayHandlers = Record<TrayAction, () => void>;

/**
 * The tray icon, its short native menu (right click) and SpeakKit's own panel (left click). Icon, tooltip and menu are rebuilt
 * only when what they show has changed.
 */
export function createTray(ctx: Ctx, context: () => TrayContext, run: TrayHandlers) {
  const tray = new Tray(trayIcon("asleep"));
  const panel = new FloatWindow("panel", { width: 340, height: 330 }, () => ctx.state);
  ctx.sinks.add((s) => panel.sendState(s));
  let menu: Menu | null = null;
  let shown = "";
  let summary = "";

  const togglePanel = () => {
    const w = panel.window;
    if (w?.isVisible()) return panel.close();
    const win = panel.open(aboveTray(tray.getBounds()), true);
    // Clicking anywhere else dismisses it, like a native flyout; closing frees its renderer.
    win.once("blur", () => panel.close());
  };
  tray.on("click", togglePanel);

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
    const template: MenuItemConstructorOptions[] = items.map((i) =>
      i.type === "separator"
        ? { type: "separator" }
        : {
            label: i.label,
            enabled: i.enabled,
            ...(i.checked !== undefined ? { type: "checkbox" as const, checked: i.checked } : {}),
            ...(i.hint ? { accelerator: i.hint.replace("Ctrl", "CommandOrControl"), registerAccelerator: false } : {}),
            click: () => run[i.action](),
          },
    );
    menu = Menu.buildFromTemplate(template);
    tray.setContextMenu(menu);
  };
  refresh();

  return {
    refresh,
    togglePanel,
    /** For tests: the native menu cannot be clicked from Playwright. */
    items: () => menu?.items ?? [],
    summary: () => summary,
    owns: (contents: Electron.WebContents) => panel.owns(contents),
    closePanel: () => panel.close(),
    dispose: () => {
      panel.close();
      tray.destroy();
    },
  };
}
