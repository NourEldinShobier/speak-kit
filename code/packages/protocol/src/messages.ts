import type { ErrorCode } from "./api";

export interface ReadSentence {
  text: string;
  block: number;
}
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
export interface SentenceStart {
  docId: string;
  index: number;
  durationMs: number;
  speed: number;
}

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
  | { t: "open-options"; section?: "voicechat" | undefined }
  /** Handshake: sent when a content script starts, again on a bfcache restore (pageshow persisted) and after a re-injection. Reply: HelloReply. */
  | { t: "hello"; url: string }
  /** A content script started in a sub-frame of the page: the worker remembers its frame id so a read can ask it for text. Reply: { ok: true }. */
  | { t: "frame" }
  /** The close control of the on-page UI: `on` stops this tab's reading and hides the UI for this tab until the next navigation or an explicit read. Reply: { ok: true }. */
  | { t: "dismiss"; on: boolean };

/** Reply to `hello`. `state` is set only when this tab is the one being read and the document has the same URL; otherwise null and the page starts idle. */
export interface HelloReply {
  state: PlayerState | null;
  dismissed: boolean;
}
/** background -> content script */
export type BgToContent =
  | { t: "state"; state: PlayerState }
  | { t: "sentence-start"; start: SentenceStart }
  | { t: "extract"; mode: "page" | "selection" | "from-here" } // reply: ExtractReply
  | { t: "settings-changed" }
  | { t: "toast"; message: string; kind?: "ok" | "info" | "err"; action?: "open-sidepanel" | "open-options"; actionLabel?: string }
  /** open or close the reader view */
  | { t: "reader"; open: boolean }
  /** Start or end a voice conversation about the page (the keyboard command). */
  | { t: "voice-toggle" }
  /** The tab's dismissed flag changed outside the page (an explicit read from the popup, the keyboard or the menu clears it). */
  | { t: "dismissed"; on: boolean };

export type ExtractReply = { doc: ReadDoc } | { error: ErrorCode };
