import { runPlayerCommand } from "./player";
import { getState } from "./state";
import { dropTab, patchTab, resetTab, samePage } from "./tabs";

/** Reading belongs to one page: when its tab is closed, navigated or discarded the audio stops. */
async function stopIfReading(tabId: number, unless?: (url: string | undefined) => boolean) {
  const s = await getState();
  if (s.tabId !== tabId || s.status === "idle") return;
  if (unless?.(s.url)) return;
  await runPlayerCommand({ cmd: "stop" });
}

export async function onTabRemoved(tabId: number): Promise<void> {
  await stopIfReading(tabId);
  await dropTab(tabId);
}

/** A new document is loading (navigation, reload, back/forward) or the tab was discarded: nothing of the old one survives. */
export async function onTabUpdated(tabId: number, info: { status?: string; url?: string; discarded?: boolean }): Promise<void> {
  if (info.status === "loading" || info.discarded) {
    await resetTab(tabId); // first, so a read that is still extracting sees the new epoch
    await stopIfReading(tabId);
  } else if (info.url) {
    // pushState / history.pushState navigation: same document, other page. A fragment change keeps reading.
    await stopIfReading(tabId, (url) => samePage(url, info.url));
  }
}

/** The tab was swapped for another one (prerender, instant navigation): the old id is gone, the new one starts fresh. */
export async function onTabReplaced(added: number, removed: number): Promise<void> {
  await onTabRemoved(removed);
  await patchTab(added, { alive: false });
}
