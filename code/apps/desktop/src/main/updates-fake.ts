import { EventEmitter } from "node:events";
import type { UpdaterLike } from "./updates";

const later = (ms: number, f: () => void) => new Promise<void>((resolve) => setTimeout(() => (f(), resolve()), ms));

/**
 * Stand-in for electron-updater, used only when SPEAKKIT_FAKE_UPDATE=<version> is set (tests). Like the real one, each call
 * resolves after its events: a check finds that version, the download reports progress, and quitAndInstall records the call
 * instead of installing.
 */
export function fakeUpdater(version: string, onInstall: () => void): UpdaterLike {
  const u = new EventEmitter() as EventEmitter & UpdaterLike;
  u.autoDownload = false;
  u.autoInstallOnAppQuit = false;
  u.checkForUpdates = () => later(20, () => u.emit("update-available", { version }));
  u.downloadUpdate = async () => {
    await later(20, () => u.emit("download-progress", { percent: 50 }));
    await later(40, () => u.emit("update-downloaded", { version }));
  };
  u.quitAndInstall = onInstall;
  return u;
}
