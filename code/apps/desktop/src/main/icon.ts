import { nativeImage } from "electron";
import type { TrayState } from "../shared/engine-view";
import { APP_ICON_PNG, TRAY_ICON_DARK_PNG, TRAY_ICON_PNG, TRAY_MAC_PNG } from "./icon-data";

export const appIcon = () => nativeImage.createFromBuffer(Buffer.from(APP_ICON_PNG, "base64"));

const cache = new Map<string, Electron.NativeImage>();
/** One small image per tray state, built on first use. With dark set it is the Windows variant for a dark taskbar (the macOS images are templates the menu bar tints itself). On macOS the 36 px menu-bar variants (2x); normal and asleep are template images that the menu bar tints. */
export function trayIcon(state: TrayState = "normal", dark = false): Electron.NativeImage {
  const key = `${state}${dark ? ":dark" : ""}`;
  let img = cache.get(key);
  if (!img) {
    if (process.platform === "darwin") {
      img = nativeImage.createFromBuffer(Buffer.from(TRAY_MAC_PNG[state], "base64"), { scaleFactor: 2 });
      img.setTemplateImage(state === "normal" || state === "asleep");
    } else img = nativeImage.createFromBuffer(Buffer.from((dark ? TRAY_ICON_DARK_PNG : TRAY_ICON_PNG)[state], "base64"));
    cache.set(key, img);
  }
  return img;
}
