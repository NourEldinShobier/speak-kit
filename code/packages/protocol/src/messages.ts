import type { ErrorCode } from "./api";

/** ---- Extension-internal messaging (chrome.runtime) ---- */

export interface ReadSentence { text: string; block: number }
/** What a content script hands to the player. Ranges stay in the page; only text crosses the boundary. */
export interface ReadDoc {
  docId: string;
  tabId: number;
  url: string;
  title: string;
  sentences: ReadSentence[];
  /** index of the sentence to start from */
  startIndex: number;
  source: "page" | "selection" | "from-here";
}

export type PlayerStatus = "idle" | "preparing" | "playing" | "paused" | "finished" | "error";

export interface PlayerState {
  status: PlayerStatus;
  docId?: string;
  tabId?: number;
  title?: string;
  url?: string;
  sentenceIndex: number;
  sentenceCount: number;
  /** estimated, refined as audio arrives */
  elapsedMs: number;
  totalMs: number;
  speed: number;
  voice: string;
  error?: { code: ErrorCode; message: string };
  queueLength: number;
}

/** Fired by the player when a sentence starts being heard; the content script derives word timing from it. */
export interface SentenceStart { docId: string; index: number; durationMs: number; speed: number }

export type PlayerCommand =
  | { cmd: "play"; doc: ReadDoc }
  | { cmd: "pause" }
  | { cmd: "resume" }
  | { cmd: "toggle" }
  | { cmd: "stop" }
  | { cmd: "seek-ms"; deltaMs: number }
  | { cmd: "seek-sentence"; index: number }
  | { cmd: "next-block" }
  | { cmd: "prev-block" }
  | { cmd: "set-speed"; speed: number }
  | { cmd: "set-voice"; voice: string }
  | { cmd: "queue-add"; doc: ReadDoc }
  | { cmd: "queue-remove"; docId: string }
  | { cmd: "queue-play"; docId: string }
  | { cmd: "queue-clear" };

/** content script / popup / side panel -> background */
export type ContentToBg =
  | { t: "player"; command: PlayerCommand }
  | { t: "get-state" }
  | { t: "open-options" };
/** background -> content script */
export type BgToContent =
  | { t: "state"; state: PlayerState }
  | { t: "sentence-start"; start: SentenceStart }
  | { t: "extract"; mode: "page" | "selection" | "from-here" } // reply: ExtractReply
  | { t: "settings-changed" };

export type ExtractReply = { doc: ReadDoc } | { error: ErrorCode };
