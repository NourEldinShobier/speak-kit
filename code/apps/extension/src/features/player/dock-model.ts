import type { PlayerStatus } from "@speakkit/protocol";
import { clock, minutesLeft, speedLabel } from "../../shared/format";
import type { UiModel } from "../../shared/ui-types";

/** What the dock shows for each player status, as tables and pure functions. dock.ts only builds the elements from them. */

export const ACTIVE: PlayerStatus[] = ["preparing", "playing", "paused"];
/** After this long in "preparing" the model is being woken up, and the dock says so. */
export const WAKING_AFTER_MS = 1200;

export const fmtLong = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
};

/** The play button of a reading dock, per status. `idle` and `error` have their own layouts. */
export const TOGGLE: Record<"preparing" | "playing" | "paused" | "finished", { label: string; icon: "loader-2" | "player-pause" | "player-play" | "refresh" }> = {
  preparing: { label: "Preparing", icon: "loader-2" },
  playing: { label: "Pause", icon: "player-pause" },
  paused: { label: "Play", icon: "player-play" },
  finished: { label: "Replay", icon: "refresh" },
};

/**
 * The dock is shown for errors, for the always-dock site rule, when finished, and while reading if no launcher exists.
 * `dismissed` is the status the user closed it in; it stays closed until the status changes (an error can be dismissed once).
 */
export function dockVisible(m: UiModel, dismissed: PlayerStatus | null): boolean {
  if (m.status === "error") return dismissed !== "error";
  if (dismissed === m.status) return false;
  if (m.alwaysDock) return true;
  if (!m.showDock || m.status === "idle") return false;
  return !m.launcher || m.status === "finished";
}

/** The line under the idle dock: engine state or the reading-time estimate. */
export function idleSubtitle(m: UiModel): string {
  if (m.engineAsleep) return "Engine asleep · wakes on play";
  const est = m.estimate();
  return est ? `${fmtLong(est)} at ${speedLabel(m.speed)}` : "";
}

/** The status line of the reading dock. `waking`: preparing has lasted long enough that the model is being loaded. */
export function dockText(m: UiModel, waking: boolean): string {
  if (m.status === "preparing") return waking ? "Waking the voice engine..." : "Preparing voice...";
  if (m.status === "finished") return "Done · Read again";
  if (m.paragraph) return `Paragraph ${m.paragraph.n} of ${m.paragraph.of} · ${minutesLeft(Math.max(0, m.totalMs - m.elapsedMs))}`;
  return `${m.status === "paused" ? "Paused" : "Reading"} · ${clock(m.elapsedMs)}`;
}
