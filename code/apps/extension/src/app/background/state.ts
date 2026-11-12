import type { BgToContent, ErrorCode, PlayerState, ReadDoc } from "@speakkit/protocol";
import { tokens } from "@speakkit/ui/tokens";
import { ERROR_TEXT } from "../../features/connection";
import { loadSettings } from "../../features/settings";
import { ignore } from "../../shared/ignore";
import type { ExtraBroadcast, QueueItem } from "../../shared/internal";
import { session } from "./session";
import { idleFor, viewFor } from "./tabs";

// A badge cannot read CSS variables, so its colours come from the generated token table.
const ACCENT = tokens.light["accent-default"];
const ERR = tokens.light["tag-red"];

export const idle = async (): Promise<PlayerState> => {
  const s = await loadSettings();
  return { status: "idle", sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0, speed: s.speed, voice: s.voice, queueLength: 0 };
};

/**
 * What the worker knows about playback. The service worker is suspended after about 30 s idle and loses module variables,
 * so everything the UI needs after a wake-up is mirrored to chrome.storage.session and read back on demand.
 */
/** A value mirrored to session storage. Reads storage once; whatever was set while the read was in flight is newer than what it returned, so the first writer wins. */
function mirror<T>(key: string, fallback: () => T | Promise<T>) {
  let value: T | undefined;
  return {
    peek: () => value,
    set(v: T) {
      value = v;
      void session.set(key, v);
    },
    async get(): Promise<T> {
      if (value !== undefined) return value;
      const stored = (await session.get<T>(key)) ?? (await fallback());
      return (value ??= stored);
    },
  };
}

const player = mirror("speakkit.lastState", idle);
const queue = mirror<QueueItem[]>("speakkit.queue", () => []);
const autoPlay = mirror("speakkit.autoPlay", () => true);
export const getState = player.get;
export const getQueue = queue.get;
export const setQueue = queue.set;
export const getAutoPlay = autoPlay.get;
export const setAutoPlay = autoPlay.set;

export const lastDoc = () => session.get<ReadDoc>("speakkit.lastDoc");
export const rememberDoc = (doc: ReadDoc) => session.set("speakkit.lastDoc", doc);

export const sendToPages = (m: BgToContent | ExtraBroadcast) => {
  chrome.runtime.sendMessage(m).catch(ignore); // no extension page is open to receive it
};
export const sendToTab = (tabId: number | undefined, m: BgToContent) => {
  if (tabId !== undefined) chrome.tabs.sendMessage(tabId, m).catch(ignore); // the tab closed or has no content script
};

const BADGE_TEXT: Partial<Record<PlayerState["status"], string>> = { playing: "▶", paused: "II", error: "!" };

function badge(state: PlayerState) {
  const text = BADGE_TEXT[state.status] ?? "";
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color: state.status === "error" ? ERR : ACCENT });
}

export function publishState(state: PlayerState) {
  // Read the previous reader before the mirror below replaces it; after a worker restart that is storage, not memory.
  const before = player.peek() ? Promise.resolve(player.peek()) : session.get<PlayerState>("speakkit.lastState");
  player.set(state);
  badge(state);
  sendToPages({ t: "state", state });
  sendToTab(state.tabId, { t: "state", state });
  // Reading moved to another tab, or stopped (a stopped player names no tab): the old reader must clear its highlight and controls.
  void before.then((prev) => {
    if (prev?.tabId !== undefined && prev.tabId !== state.tabId) sendToTab(prev.tabId, { t: "state", state: idleFor(state, prev.tabId) });
  });
}

/** The state one tab may see (see viewFor). Extension pages, which have no tab, use getState. */
export const getTabState = async (tabId: number) => viewFor(await getState(), tabId);

const optionalTab = (tabId: number | undefined) => (tabId === undefined ? {} : { tabId });

/** Nothing is being read: the player is idle, has finished or failed. */
export const isSettled = (s: PlayerState) => s.status === "idle" || s.status === "finished" || s.status === "error";

export async function reportError(code: ErrorCode, tabId?: number) {
  const base = await getState();
  const error = { code, message: ERROR_TEXT[code] };
  // Another tab is being read: its audio keeps playing, so the failure is shown only in the tab that asked.
  if (tabId !== undefined && base.tabId !== undefined && base.tabId !== tabId && !isSettled(base)) {
    sendToTab(tabId, { t: "state", state: { ...idleFor(base, tabId), status: "error", error } });
    return;
  }
  publishState({ ...base, status: "error", ...optionalTab(tabId ?? base.tabId), error });
}
