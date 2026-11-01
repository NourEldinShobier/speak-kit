import type { BgToContent, ErrorCode, PlayerState, ReadDoc } from "@speakkit/protocol";
import { tokens } from "@speakkit/ui/tokens";
import { ERROR_TEXT } from "../../features/connection";
import { loadSettings } from "../../features/settings";
import type { ExtraBroadcast, QueueItem } from "../../shared/internal";

/**
 * What the worker knows about playback. The service worker is suspended after about 30 s idle and loses module variables,
 * so everything the UI needs after a wake-up is mirrored to chrome.storage.session and read back on demand.
 */
const SESSION_STATE = "speakkit.lastState";
const SESSION_DOC = "speakkit.lastDoc";
const SESSION_QUEUE = "speakkit.queue";
const SESSION_AUTOPLAY = "speakkit.autoPlay";

const session = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return (await chrome.storage.session.get(key))[key] as T | undefined;
    } catch {
      return undefined; // session storage unavailable: callers fall back to the idle default
    }
  },
  set(key: string, value: unknown): void {
    // Losing the mirror only costs the state after a worker restart; the in-memory value is still right.
    chrome.storage.session.set({ [key]: value }).catch(() => {});
  },
};

// A badge cannot read CSS variables, so its colours come from the generated Lumen token table.
const ACCENT = tokens.light["accent-default"];
const ERR = tokens.light["tag-red"];

const idleState = async (): Promise<PlayerState> => {
  const s = await loadSettings();
  return { status: "idle", sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0, speed: s.speed, voice: s.voice, queueLength: 0 };
};
export const idle = idleState;

let lastState: PlayerState | undefined;
let queue: QueueItem[] | undefined;
let autoPlay: boolean | undefined;

/** Reads storage once. Whatever was set while the read was in flight is newer than what it returned, so the first writer wins. */
async function cached<T>(current: () => T | undefined, set: (v: T) => void, read: () => Promise<T>): Promise<T> {
  const have = current();
  if (have !== undefined) return have;
  const stored = await read();
  const now = current();
  if (now !== undefined) return now;
  set(stored);
  return stored;
}

export const getState = (): Promise<PlayerState> =>
  cached(
    () => lastState,
    (v) => (lastState = v),
    async () => (await session.get<PlayerState>(SESSION_STATE)) ?? (await idleState()),
  );

export const getQueue = (): Promise<QueueItem[]> =>
  cached(
    () => queue,
    (v) => (queue = v),
    async () => (await session.get<QueueItem[]>(SESSION_QUEUE)) ?? [],
  );
export function setQueue(q: QueueItem[]): void {
  queue = q;
  session.set(SESSION_QUEUE, q);
}

export const getAutoPlay = (): Promise<boolean> =>
  cached(
    () => autoPlay,
    (v) => (autoPlay = v),
    async () => (await session.get<boolean>(SESSION_AUTOPLAY)) ?? true,
  );
export function setAutoPlay(on: boolean): void {
  autoPlay = on;
  session.set(SESSION_AUTOPLAY, on);
}

export const lastDoc = () => session.get<ReadDoc>(SESSION_DOC);
export const rememberDoc = (doc: ReadDoc) => session.set(SESSION_DOC, doc);

export const sendToPages = (m: BgToContent | ExtraBroadcast) => {
  chrome.runtime.sendMessage(m).catch(() => {}); // no extension page is open to receive it
};
export const sendToTab = (tabId: number | undefined, m: BgToContent) => {
  if (tabId !== undefined) chrome.tabs.sendMessage(tabId, m).catch(() => {}); // the tab closed or has no content script
};

function badge(state: PlayerState) {
  const text = state.status === "playing" ? "▶" : state.status === "paused" ? "II" : state.status === "error" ? "!" : "";
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color: state.status === "error" ? ERR : ACCENT });
}

export function publishState(state: PlayerState) {
  // Reading moved to another tab: tell the old one so it clears its highlight and controls.
  const prev = lastState?.tabId;
  if (prev !== undefined && state.tabId !== undefined && prev !== state.tabId) sendToTab(prev, { t: "state", state: { ...state, status: "idle", tabId: prev } });
  lastState = state;
  session.set(SESSION_STATE, state);
  badge(state);
  sendToPages({ t: "state", state });
  sendToTab(state.tabId, { t: "state", state });
}

const optionalTab = (tabId: number | undefined) => (tabId === undefined ? {} : { tabId });

export async function reportError(code: ErrorCode, tabId?: number) {
  const base = await getState();
  publishState({ ...base, status: "error", ...optionalTab(tabId ?? base.tabId), error: { code, message: ERROR_TEXT[code] } });
}
