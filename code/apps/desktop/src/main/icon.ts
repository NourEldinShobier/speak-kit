import { nativeImage } from "electron";
import type { TrayState } from "../shared/engine-view";
import { logoBitmap } from "./icon-bitmap";

export const appIcon = () => nativeImage.createFromBitmap(logoBitmap(256), { width: 256, height: 256 });

const cache = new Map<TrayState, Electron.NativeImage>();
/** One small image per tray state, built on first use. */
export function trayIcon(state: TrayState = "normal"): Electron.NativeImage {
  let img = cache.get(state);
  if (!img) cache.set(state, (img = nativeImage.createFromBitmap(logoBitmap(32, state), { width: 32, height: 32 })));
  return img;
}
