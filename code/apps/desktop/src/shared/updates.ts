import { exportRunning } from "./export";
import type { AppState } from "./ipc";

/** Why a check or download failed, as far as the message tells. The UI words each reason; "other" shows the raw message. */
export type UpdateFailure = "offline" | "not-found" | "checksum" | "interrupted" | "other";

/**
 * Update flow shown by the title bar pill, the popover (H18), the update card (H9) and the updating card (H19). Updates are never forced.
 * "manual" is the macOS flow: the unsigned app cannot replace itself, so a newer release is only announced and its page opened.
 */
export type UpdateState =
  | { kind: "unsupported" }
  | { kind: "idle"; checkedAtMs: number | null }
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string; onQuit: boolean }
  | { kind: "restarting"; version: string }
  | { kind: "manual"; version: string; url: string }
  | { kind: "error"; message: string; reason: UpdateFailure; phase: "check" | "download" };

export const UPDATE_UNSUPPORTED: UpdateState = { kind: "unsupported" };

export const UPDATE_ACTIONS = ["check", "download", "install-now", "install-now-anyway", "install-on-quit", "remind-later", "open-release"] as const;
export type UpdateAction = (typeof UPDATE_ACTIONS)[number];

/** Maps an electron-updater / network error message to a reason. Checksum and 404 are matched before the generic network codes. */
export function classifyUpdateError(message: string): UpdateFailure {
  if (/checksum|sha512|sha256/i.test(message)) return "checksum";
  if (/\b404\b|cannot find (latest|channel)|not found/i.test(message)) return "not-found";
  if (/ECONNRESET|socket hang up|aborted|premature|ERR_CONNECTION_(RESET|CLOSED|ABORTED)|ERR_HTTP2|ERR_STREAM|stream.*(closed|ended)/i.test(message)) return "interrupted";
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|timed? ?out|fetch failed/i.test(message))
    return "offline";
  return "other";
}

/** What the user reads for a failed update. */
export function updateErrorText(reason: UpdateFailure, phase: "check" | "download", message: string): { title: string; body: string } {
  const title = phase === "download" ? "Could not download the update" : "Could not check for updates";
  switch (reason) {
    case "offline":
      return { title, body: "Speak Kit cannot reach the update server. Check your internet connection and try again." };
    case "not-found":
      return { title, body: "No update information is published at the update address yet. Try again later." };
    case "checksum":
      return { title, body: "The downloaded file did not match its checksum, so it was discarded. Try again; nothing was installed." };
    case "interrupted":
      return { title, body: "The connection dropped during the download. Try again to fetch the update again; nothing was installed." };
    case "other":
      return { title, body: message };
  }
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

/** True when `latest` is a higher version than `current` (x.y.z; a prerelease is lower than its release). Unparseable input is never newer. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = SEMVER.exec(latest);
  const b = SEMVER.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) if (Number(a[i]) !== Number(b[i])) return Number(a[i]) > Number(b[i]);
  return !a[4] && !!b[4];
}

/** What would stop if the app restarted for the update now: the running reading and exports (the same two things the quit dialog lists). */
export function updateBlockers(s: Pick<AppState, "reader" | "exports">): { reading: boolean; exports: number } {
  const r = s.reader.status;
  return { reading: r === "playing" || r === "preparing" || r === "paused", exports: s.exports.filter(exportRunning).length };
}

export const workRunning = (s: Pick<AppState, "reader" | "exports">) => {
  const b = updateBlockers(s);
  return b.reading || b.exports > 0;
};
