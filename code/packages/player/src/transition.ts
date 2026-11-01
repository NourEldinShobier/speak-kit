import type { PlayerStatus } from "@speakkit/protocol";

/** What can happen to the playback status. `resume-*` says whether audio is already scheduled. */
export type PlayerEvent = "begin" | "pause" | "resume-playing" | "resume-preparing" | "restart" | "audio" | "finish" | "fail" | "stop";

type Table = { readonly [S in PlayerStatus]: Readonly<Partial<Record<PlayerEvent, PlayerStatus>>> };

const live = { begin: "preparing", restart: "preparing", pause: "paused", finish: "finished", fail: "error", stop: "idle" } as const;
const ended = { begin: "preparing", restart: "preparing", fail: "error", stop: "idle" } as const;

/** One row per status; an event missing from a row is ignored in that status. Adding a status fails to compile until its row exists. */
const TABLE = {
  idle: ended,
  preparing: { ...live, audio: "playing" },
  playing: live,
  paused: { begin: "preparing", restart: "paused", "resume-playing": "playing", "resume-preparing": "preparing", fail: "error", stop: "idle" },
  finished: ended,
  error: ended,
} as const satisfies Table;

/** The status after `event`, or undefined when the event does not apply in `status` (the caller does nothing). Pure. */
export function transition(status: PlayerStatus, event: PlayerEvent): PlayerStatus | undefined {
  return (TABLE[status] as Table[PlayerStatus])[event];
}

/** Playback is in progress or can be resumed: a play request would join the queue instead of starting. */
export const isActive = (s: PlayerStatus): boolean => s === "playing" || s === "paused" || s === "preparing";

/** Nothing is playing and nothing will: the idle timer may run out. */
export const isEnded = (s: PlayerStatus): boolean => s === "idle" || s === "finished" || s === "error";
