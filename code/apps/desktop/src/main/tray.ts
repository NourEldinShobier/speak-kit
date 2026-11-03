import { Menu, Tray, type MenuItemConstructorOptions } from "electron";
import { trayIconState, trayMenuModel, trayTooltipFor, type TrayAction, type TrayContext } from "../shared/tray";
import { aboveTray, FloatWindow, floatChangedWithin } from "./windows";
import { trayIcon } from "./icon";
import type { Ctx } from "./context";

/** A blur this soon after a mini player or panel opened or closed is Windows reassigning the active window, not the user clicking elsewhere. */
const FLOAT_CHANGE_GRACE_MS = 400;

type TrayHandlers = Record<TrayAction, () => void>;

function menuTemplate(items: ReturnType<typeof trayMenuModel>, run: TrayHandlers, mac: boolean): MenuItemConstructorOptions[] {
  return items.map((i) =>
    i.type === "separator"
      ? { type: "separator" }
      : {
          label: i.label,
          enabled: i.enabled,
          ...(i.checked !== undefined ? { type: "checkbox" as const, checked: i.checked } : {}),
          ...(i.hint ? { accelerator: i.hint.replace("Ctrl", mac ? "Control" : "CommandOrControl"), registerAccelerator: false } : {}),
          click: () => run[i.action](),
        },
  );
}

/**
 * The tray icon, its short native menu (right click) and SpeakKit's own panel (left click). Icon, tooltip and menu are rebuilt
 * only when what they show has changed.
 */
export function createTray(ctx: Ctx, context: () => TrayContext, run: TrayHandlers) {
  const mac = process.platform === "darwin";
  const tray = new Tray(trayIcon("asleep"));
  const panel = new FloatWindow("panel", { width: 320, height: 330 }, () => ctx.state);
  ctx.sinks.add((s) => panel.sendState(s));
  let menu: Menu | null = null;
  let shown = "";
  let summary = "";

  const togglePanel = () => {
    const w = panel.window;
    if (w?.isVisible()) return panel.close();
    const win = panel.open(aboveTray(tray.getBounds()), true);
    run.wake(); // the panel is where a read is started from: load the model while it opens
    // Clicking anywhere else dismisses it, like a native flyout; closing frees its renderer. Only a panel that
    // has had focus can lose it: another window taking focus first must not close it before it was ever shown.
    const closeOnBlur = () => win.once("blur", () => (floatChangedWithin(FLOAT_CHANGE_GRACE_MS) ? closeOnBlur() : panel.close()));
    win.once("focus", closeOnBlur);
  };
  tray.on("click", togglePanel);
  // macOS opens a context menu on the normal click, which would hide the panel: show it on right click only.
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
