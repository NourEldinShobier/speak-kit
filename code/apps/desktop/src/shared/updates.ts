import type { DesktopError } from "./errors";
import { exportRunning } from "./export";
import type { AppState } from "./ipc";

/**
 * Update flow shown by the title bar pill, the popover, the update card and the updating card. Updates are never forced.
 * `notes` are the lines of the release (merged pull request titles), when the release has any. "manual" is the macOS flow: the unsigned app cannot replace itself, so a newer release is only announced and its page opened.
 */
export type UpdateState =
  | { kind: "unsupported" }
  | { kind: "idle"; checkedAtMs: number | null }
  | { kind: "checking" }
  | { kind: "available"; version: string; notes?: string[] }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string; onQuit: boolean; notes?: string[] }
  | { kind: "restarting"; version: string }
  | { kind: "manual"; version: string; url: string; notes?: string[] }
  | { kind: "error"; error: DesktopError; phase: "check" | "download" };

export const UPDATE_UNSUPPORTED: UpdateState = { kind: "unsupported" };

export const UPDATE_ACTIONS = ["check", "download", "install-now", "install-now-anyway", "install-on-quit", "open-release"] as const;
export type UpdateAction = (typeof UPDATE_ACTIONS)[number];

/** Maps an electron-updater / network error message to an error. Checksum and 404 are matched before the generic network codes. */
export function classifyUpdateError(message: string): DesktopError {
  if (/checksum|sha512|sha256/i.test(message)) return { code: "update-checksum" };
  if (/\b404\b|cannot find (latest|channel)|not found/i.test(message)) return { code: "update-not-found" };
  if (/ECONNRESET|socket hang up|aborted|premature|ERR_CONNECTION_(RESET|CLOSED|ABORTED)|ERR_HTTP2|ERR_STREAM|stream.*(closed|ended)/i.test(message)) return { code: "update-interrupted" };
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|timed? ?out|fetch failed/i.test(message))
    return { code: "update-offline" };
  return { code: "update-failed", args: { detail: message } };
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
