import type {
  ErrorCode,
  Health,
  PlayerCommand,
  PlayerState,
  ReadDoc,
  SentenceStart,
  Settings,
  VoiceList,
} from "@speakkit/protocol";

/** Messages between the service worker and the offscreen player, plus extra worker requests beyond protocol/messages.ts. */

/** Everything the player needs to talk to the server. The offscreen document has no chrome.storage, so the worker passes it along. */
export interface PlayerConfig {
  port: number;
  token: string;
  voice: string;
  speed: number;
  pause: Settings["pauseBetweenParagraphs"];
}

export interface QueueItem {
  docId: string;
  tabId: number;
  title: string;
  url: string;
  sentenceCount: number;
  /** estimated reading time at the current speed */
  estMs: number;
}

export type ToOffscreen =
  | { to: "offscreen"; command: PlayerCommand; cfg: PlayerConfig }
  | { to: "offscreen"; query: "queue" }
  | { to: "offscreen"; autoPlay: boolean };

export type FromOffscreen =
  | { from: "offscreen"; kind: "state"; state: PlayerState }
  | { from: "offscreen"; kind: "sentence-start"; start: SentenceStart; tabId?: number }
  | { from: "offscreen"; kind: "queue"; queue: QueueItem[] }
  /** playback has been stopped for 60 s and nothing is queued: the worker may close the document */
  | { from: "offscreen"; kind: "idle" };

export type ConnResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string };

/** Extra requests answered by the service worker (contract additions, see the final report). */
export type ExtraToBg =
  | { t: "get-health"; force?: boolean } // reply ConnResult<Health>, cached 3 s
  | { t: "auth-check"; port?: number; token?: string } // reply ConnResult<true>; defaults to the stored port/token
  | { t: "get-voices" } // reply ConnResult<VoiceList>
  | { t: "get-queue" } // reply QueueItem[]
  | { t: "read"; mode: "page" | "selection" | "from-here"; tabId?: number; queue?: boolean } // reply { ok: boolean }
  | { t: "open-sidepanel"; windowId?: number }
  /** sent by the popup and side panel */
  | { t: "read-tab"; tabId: number; mode: "page" | "selection"; queue?: boolean }
  | { t: "set-auto-play"; on: boolean }
  | { t: "preview"; voice: string; speed?: number; text: string }
  /** sent by the content script dock */
  | { t: "preview-voice"; voice: string }
  | { t: "open-app" }
  | { t: "launch-app" } // reply { ok, via } : opens the speakkit:// deep link (see features/connection/launch.ts)
  /** load the model ahead of the click; the worker debounces and ignores failures */
  | { t: "warm"; reason?: "popup" | "hover" | "selection" | "dock" | "options" }
  /** open or close the reader view of a tab (default: the active tab) */
  | { t: "reader"; tabId?: number; open: boolean };

/** Extra pushes from the worker to a content script (besides protocol BgToContent). */
export type ExtraBgToContent =
  | { t: "toast"; message: string; kind?: "ok" | "info" | "err"; action?: "open-sidepanel" | "open-options"; actionLabel?: string }
  | { t: "reader"; open: boolean };

export interface VoiceInfo {
  id: string;
  name: string;
  /** "US English" / "UK English" */
  desc: string;
  quality: string;
  gender?: "female" | "male";
  lang?: "en-US" | "en-GB";
}

/** Broadcast by the worker to extension pages (in addition to BgToContent state / sentence-start). */
export type ExtraBroadcast = { t: "queue"; queue: QueueItem[] };

export type { ErrorCode, Health, ReadDoc, VoiceList };
