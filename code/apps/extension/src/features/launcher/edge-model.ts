import type { PlayerStatus, Settings } from "@speakkit/protocol";
import { clock } from "../../shared/format";
import type { UiModel } from "../../shared/ui-types";

/** What the edge launcher shows for each player status, and where its tab and pill sit: tables and pure functions. edge.ts builds the elements. */

export const ACTIVE: PlayerStatus[] = ["preparing", "playing", "paused"];
export const TAB_HEIGHT = 76;
export const MARGIN = 8;
/** Centre of the big play button inside the pill, measured from the pill top. */
const PLAY_CENTRE = 10 + 28 + 8 + 32 + 8 + 22;
/** The tab's middle sits this far below its top. */
const TAB_MIDDLE = 38;
/** The collapsed reading state (B19-V2): a 12 px wide tab that holds only a progress rail, centred on the viewport height. */
export const RAIL_WIDTH = 12;
export const RAIL_HEIGHT = 96;
const RAIL_MIDDLE = RAIL_HEIGHT / 2;

type PlayIcon = "loader-2" | "player-pause" | "player-play";

/** The play button of the tab (while reading) and of the pill. Statuses that are not being read invite a new reading. */
export const PLAY_VIEW: Record<PlayerStatus, { label: string; icon: PlayIcon }> = {
  idle: { label: "Listen to this page", icon: "player-play" },
  finished: { label: "Listen to this page", icon: "player-play" },
  error: { label: "Listen to this page", icon: "player-play" },
  preparing: { label: "Resume", icon: "loader-2" },
  playing: { label: "Pause", icon: "player-pause" },
  paused: { label: "Resume", icon: "player-play" },
};

/** `sk-left` when the launcher sits on the left edge. */
export const sideClass = (l: Settings["launcher"]) => (l.side === "left" ? " sk-left" : "");

export const tabClass = (l: Settings["launcher"], reading: boolean) =>
  `sk-tab${sideClass(l)}${reading && l.widerWhileReading ? " is-reading" : ""}${!reading && l.idle === "hidden" ? " is-ghost" : ""}`;

/** Top of the tab: the saved height `y` (0 to 1 of the viewport) kept fully on screen. */
export const tabTop = (y: number, vh: number): number => Math.min(Math.max(MARGIN, y * vh), Math.max(MARGIN, vh - TAB_HEIGHT - MARGIN));

/** Top of the reading rail: centred on the viewport height, whatever height the idle tab was dragged to. */
export const railTop = (vh: number): number => Math.max(MARGIN, Math.round((vh - RAIL_HEIGHT) / 2));

/** Top of the pill: its play button lines up with the tab middle, and the pill stays fully on screen. */
export const pillTop = (tab: number, vh: number, pillHeight: number): number => Math.min(Math.max(MARGIN, tab + TAB_MIDDLE - PLAY_CENTRE), Math.max(MARGIN, vh - pillHeight - MARGIN));

/** Top of the pill beside the reading rail: its play button lines up with the rail middle. */
export const railPillTop = (rail: number, vh: number, pillHeight: number): number => pillTop(rail + RAIL_MIDDLE - TAB_MIDDLE, vh, pillHeight);

/** Label and keyboard hint of the pill's play tooltip. The hint is empty when there is nothing to say. */
export function tooltipText(m: UiModel, reading: boolean): { label: string; hint: string } {
  if (reading) return { label: m.status === "paused" ? "Resume" : "Pause", hint: "Space" };
  if (m.engineAsleep) return { label: "Listen to this page", hint: "Wakes on play" };
  const est = m.estimate();
  return { label: "Listen to this page", hint: est ? clock(est) : "" };
}
