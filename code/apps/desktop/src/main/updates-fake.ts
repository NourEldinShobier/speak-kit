import { EventEmitter } from "node:events";
import type { UpdaterLike } from "./updates";

const later = (ms: number, f: () => void) => new Promise<void>((resolve) => setTimeout(() => (f(), resolve()), ms));

/** The release body the fake updater reports: merged pull request titles, as a generated GitHub release has them. */
export const FAKE_RELEASE_NOTES = "## Changes\n* feat(tray): a notice row for problems by @dev in #41\n* fix(update): keep the notes of the new version by @dev in #42";

/**
 * Stand-in for electron-updater, used only when SPEAKKIT_FAKE_UPDATE=<version> is set (tests). Like the real one, each call
 * resolves after its events: a check finds that version, the download reports progress, and quitAndInstall records the call
 * instead of installing.
 */
export function fakeUpdater(version: string, onInstall: () => void): UpdaterLike {
  const u = new EventEmitter() as EventEmitter & UpdaterLike;
  u.autoDownload = false;
  u.autoInstallOnAppQuit = false;
  u.checkForUpdates = () => later(20, () => u.emit("update-available", { version, releaseNotes: FAKE_RELEASE_NOTES }));
  u.downloadUpdate = async () => {
    await later(20, () => u.emit("download-progress", { percent: 50 }));
    await later(40, () => u.emit("update-downloaded", { version, releaseNotes: FAKE_RELEASE_NOTES }));
  };
  u.quitAndInstall = onInstall;
  return u;
}

/** Stand-in for the GitHub latest-release lookup of the manual (macOS) flow, used with SPEAKKIT_UPDATE_MANUAL=<version> (tests). */
export const fakeRelease = (version: string) => async () => ({ version, url: `https://github.com/NourEldinShobier/speak-kit/releases/tag/v${version}` });
