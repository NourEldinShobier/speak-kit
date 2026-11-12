import type { HelloReply, PlayerState } from "@speakkit/protocol";
import { session } from "./session";

/**
 * What the worker keeps per browser tab. One key per tab in chrome.storage.session, so a suspended worker loses nothing and
 * two tabs never write the same key. A tab with no key has the defaults. Everything else per tab (playback state, the document,
 * the sentence) is the one player state read through `viewFor`, because there is only one audio output.
 */
export interface TabInfo {
  /** The user closed the on-page UI of this tab; cleared by a navigation or an explicit read. */
  dismissed: boolean;
  /** A content script of this document said hello. */
  alive: boolean;
  /** Sub-frames of the page whose content script has started (their frame ids), newest last. */
  frames: number[];
  /** Counts navigations; an asynchronous start that began in an earlier one must not play. */
  epoch: number;
}

/** Frames remembered per tab; a page with more (ads, widgets) keeps the newest. */
export const MAX_FRAMES = 16;
const FRESH: TabInfo = { dismissed: false, alive: false, frames: [], epoch: 0 };
const key = (tabId: number) => `speakkit.tab.${tabId}`;
/** Writes to one tab queue behind each other, so two patches made in a row both land. */
const writes = new Map<number, Promise<unknown>>();

export async function getTab(tabId: number): Promise<TabInfo> {
  return { ...FRESH, ...(await session.get<Partial<TabInfo>>(key(tabId))) }; // storage unavailable: behave as a tab nobody dismissed
}

export function patchTab(tabId: number, patch: Partial<TabInfo> | ((t: TabInfo) => Partial<TabInfo>)): Promise<TabInfo> {
  const run = async () => {
    const tab = await getTab(tabId);
    const next = { ...tab, ...(typeof patch === "function" ? patch(tab) : patch) };
    await session.set(key(tabId), next);
    return next;
  };
  const p = (writes.get(tabId) ?? Promise.resolve()).then(run, run);
  writes.set(tabId, p);
  return p;
}

/** The tab navigated or was reloaded: the old document and its flags are gone. */
export const resetTab = (tabId: number) => patchTab(tabId, (t) => ({ ...FRESH, epoch: t.epoch + 1 }));

export async function dropTab(tabId: number): Promise<void> {
  writes.delete(tabId);
  await session.remove(key(tabId));
}

/** Two URLs are the same page when they differ at most in the fragment. */
export function samePage(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  try {
    const x = new URL(a);
    const y = new URL(b);
    x.hash = y.hash = "";
    return x.href === y.href;
  } catch {
    return a === b; // not a URL: only an identical string is the same page
  }
}

/** The player state as one tab may see it: the tab being read gets the state, any other tab is idle. */
export function viewFor(state: PlayerState, tabId: number | undefined): PlayerState {
  if (tabId === undefined || state.tabId === tabId) return state;
  return idleFor(state, tabId);
}

/** An idle state for `tabId` that keeps the global speed and voice and carries nothing of another tab's document. */
export function idleFor(state: PlayerState, tabId: number): PlayerState {
  const { docId: _d, title: _t, url: _u, error: _e, ...rest } = state;
  return { ...rest, status: "idle", tabId, sentenceIndex: 0, sentenceCount: 0, elapsedMs: 0, totalMs: 0 };
}

/** What a content script gets when it says hello: the running state only if this tab is the reader and the document is the one that was read. */
export function helloReply(state: PlayerState, tab: TabInfo, page: { tabId: number; url: string }): HelloReply {
  const reading = state.tabId === page.tabId && state.status !== "idle" && !tab.dismissed && samePage(state.url, page.url);
  return { state: reading ? state : null, dismissed: tab.dismissed };
}
