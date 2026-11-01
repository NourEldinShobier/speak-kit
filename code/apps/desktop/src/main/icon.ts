import { nativeImage } from "electron";
import type { TrayState } from "../shared/engine-view";
import { APP_ICON_PNG, TRAY_ICON_PNG } from "./icon-data";

export const appIcon = () => nativeImage.createFromBuffer(Buffer.from(APP_ICON_PNG, "base64"));

const cache = new Map<TrayState, Electron.NativeImage>();
/** One small image per tray state, built on first use. */
export function trayIcon(state: TrayState = "normal"): Electron.NativeImage {
  let img = cache.get(state);
  if (!img) cache.set(state, (img = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG[state], "base64"))));
  return img;
}
