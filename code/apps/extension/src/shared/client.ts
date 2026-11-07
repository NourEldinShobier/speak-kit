import type { ContentToBg, ErrorCode, Health, PlayerCommand, PlayerState } from "@speakkit/protocol";
import type { ExtraToBg } from "./internal";

/**
 * Thin typed client for the service worker, used by the popup, options page, side panel and content script.
 * The wire format is `{ t, ...payload }` (protocol ContentToBg plus ExtraToBg).
 */
export type HealthResult = { ok: true; health: Health; ms: number } | { ok: false; error: Extract<ErrorCode, "app-not-running" | "token-rejected" | "version-mismatch">; detail?: string };

export interface QueueItem {
  docId: string;
  title: string;
  url: string;
  sentenceCount: number;
  estMs: number;
}
export interface OutlineItem {
  index: number;
  text: string;
}
export interface QueueSnapshot {
  items: QueueItem[];
  outline: OutlineItem[];
  autoPlay: boolean;
}

type UiMessage = ContentToBg | ExtraToBg;

const hasChrome = () => typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;

export async function send<T = unknown>(msg: UiMessage): Promise<T | undefined> {
  if (!hasChrome()) return undefined;
  try {
    return (await chrome.runtime.sendMessage(msg)) as T | undefined;
  } catch {
    return undefined; // worker asleep or no receiver; callers treat undefined as "no answer"
  }
}

export const command = (c: PlayerCommand) => send({ t: "player", command: c });
export const getState = () => send<PlayerState>({ t: "get-state" });
export const getHealth = async (force = false): Promise<HealthResult> => (await send<HealthResult>({ t: "get-health", force })) ?? { ok: false, error: "app-not-running" };
export const getQueue = () => send<QueueSnapshot>({ t: "get-queue" });
export const openOptions = () => send({ t: "open-options" });
/** Previews go through the player so the UI never touches the server. */
export const previewVoice = (voice: string, text: string, speed?: number) => send({ t: "preview", voice, text, ...(speed === undefined ? {} : { speed }) });

let lastWarm = -Infinity;
/** Ask the app to load the model ahead of the click. Debounced here (2 s) and again in the worker (5 s). */
export function warm(reason: "popup" | "hover" | "selection" | "dock" | "options", now = Date.now()): void {
  if (now - lastWarm < 2000) return;
  lastWarm = now;
  void send({ t: "warm", reason });
}

/** Subscribe to player-state broadcasts. Returns an unsubscribe function. */
export function onPlayerState(cb: (s: PlayerState) => void): () => void {
  if (!hasChrome()) return () => {};
  const h = (m: unknown) => {
    const x = m as { t?: string; state?: PlayerState };
    if (x?.t === "state" && x.state) cb(x.state);
  };
  chrome.runtime.onMessage.addListener(h);
  return () => chrome.runtime.onMessage.removeListener(h);
}
