import type { BgToContent, ErrorCode, ExtractReply } from "@speakkit/protocol";
import { classifyUrl } from "../../features/connection";
import { pickFrame, type FrameReply } from "./frames";
import { loadSettings, siteRule } from "../../features/settings";
import { runPlayerCommand } from "./player";
import { reportError, sendToTab } from "./state";
import { getTab, patchTab } from "./tabs";

type ReadMode = "page" | "selection" | "from-here";

export async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

const LOAD_WAIT_MS = 5000;

/** Resolves when the tab has finished loading (its manifest content script is then in place), or after a limit. */
function loaded(tabId: number): Promise<void> {
  return new Promise((done) => {
    const finish = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      done();
    };
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(finish, LOAD_WAIT_MS);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs
      .get(tabId)
      .then((t) => t.status === "complete" && finish())
      .catch(finish); // the tab is gone; the ask below fails and reports it
  });
}

/**
 * Sends a message to a tab's content script. A page that has none is injected once, never while it is still loading (the manifest script
 * arrives at document_idle and would be a second copy) and never when a copy already said hello. null: the page could not be reached.
 */
async function askTab<T>(tabId: number, msg: BgToContent): Promise<{ reply: T } | null> {
  const ask = async () => ({ reply: (await chrome.tabs.sendMessage(tabId, msg, { frameId: 0 })) as T });
  try {
    return await ask();
  } catch {
    /* no content script yet, or it is not listening yet */
  }
  await loaded(tabId);
  try {
    return await ask();
  } catch {
    /* still none: inject on demand */
  }
  try {
    if ((await getTab(tabId)).alive) return null; // a copy exists but did not answer: a second one would only double the page UI
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return await ask();
  } catch {
    return null;
  }
}

async function checkReadable(url: string | undefined): Promise<ErrorCode | undefined> {
  const c = classifyUrl(url);
  if (c === "unreadable") return "page-unreadable";
  if (c === "file" && !(await chrome.extension.isAllowedFileSchemeAccess())) return "file-access";
  return undefined;
}

async function askFrame(tabId: number, msg: BgToContent, frameId: number): Promise<FrameReply> {
  try {
    return { frameId, reply: (await chrome.tabs.sendMessage(tabId, msg, { frameId })) as ExtractReply | undefined };
  } catch {
    return { frameId, reply: undefined }; // the frame went away before it answered
  }
}

/** What a read can come back with: the document, or the reason there is nothing to read. */
function outcome(r: ExtractReply | undefined): ExtractReply {
  if (!r) return { error: "page-unreadable" };
  return "error" in r || r.doc.sentences.length ? r : { error: "page-unreadable" };
}

/** The frame has no text to read. */
const empty = (r: FrameReply | undefined) => "error" in outcome(r?.reply);

export async function startRead(tabId: number, mode: ReadMode, opts: { queue?: boolean; fallbackToPage?: boolean } = {}): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if (siteRule(await loadSettings(), tab.url) === "never-read") return false;
  const bad = await checkReadable(tab.url);
  if (bad) {
    await reportError(bad, tabId);
    return false;
  }
  const epoch = (await getTab(tabId)).epoch;
  const extract = async (m: ReadMode) => {
    const msg: BgToContent = { t: "extract", mode: m };
    const top = (await askTab<ExtractReply | undefined>(tabId, msg))?.reply;
    // The page text may sit in a sub-frame (an app shell around an embedded document): ask every frame that announced itself.
    const frames = await Promise.all((await getTab(tabId)).frames.map((frameId) => askFrame(tabId, msg, frameId)));
    return pickFrame([{ frameId: 0, reply: top }, ...frames]);
  };
  let picked = await extract(mode);
  if (opts.fallbackToPage && mode === "selection" && empty(picked)) picked = await extract("page");
  const reply = outcome(picked?.reply);
  if ("error" in reply) {
    await reportError(reply.error, tabId);
    return false;
  }
  // The tab was reloaded or navigated while the text was being extracted: that page is gone.
  if ((await getTab(tabId)).epoch !== epoch) return false;
  await undismiss(tabId); // an explicit request to read brings the page UI back
  // A frame's document is read as part of the tab: it carries the tab's address and title, which the page's own hello is matched against.
  const doc = picked!.frameId ? { ...reply.doc, tabId, url: tab.url ?? reply.doc.url, title: tab.title || reply.doc.title } : { ...reply.doc, tabId };
  await runPlayerCommand({ cmd: opts.queue ? "queue-add" : "play", doc });
  if (opts.queue) sendToTab(tabId, { t: "toast", message: "Added to queue", kind: "ok", action: "open-sidepanel", actionLabel: "View queue" });
  return true;
}

async function undismiss(tabId: number) {
  if (!(await getTab(tabId)).dismissed) return;
  await patchTab(tabId, { dismissed: false });
  sendToTab(tabId, { t: "dismissed", on: false });
}

export async function toggleReader(tabId: number, open: boolean): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if ((await checkReadable(tab.url)) || siteRule(await loadSettings(), tab.url) === "never-read") return false;
  return (await askTab<unknown>(tabId, { t: "reader", open })) !== null;
}
