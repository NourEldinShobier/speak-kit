import type { BgToContent, ErrorCode, ExtractReply } from "@speakkit/protocol";
import { classifyUrl } from "../../features/connection";
import { loadSettings, siteRule } from "../../features/settings";
import { runPlayerCommand } from "./player";
import { reportError, sendToTab } from "./state";

type ReadMode = "page" | "selection" | "from-here";

export async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

/** Sends a message to a tab's content script, injecting it first when the page has none yet. null: the page could not be reached. */
async function askTab<T>(tabId: number, msg: BgToContent): Promise<{ reply: T } | null> {
  const ask = async () => ({ reply: (await chrome.tabs.sendMessage(tabId, msg)) as T });
  try {
    return await ask();
  } catch {
    /* no content script yet: inject on demand */
  }
  try {
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

export async function startRead(tabId: number, mode: ReadMode, opts: { queue?: boolean; fallbackToPage?: boolean } = {}): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if (siteRule(await loadSettings(), tab.url) === "never-read") return false;
  const bad = await checkReadable(tab.url);
  if (bad) {
    await reportError(bad, tabId);
    return false;
  }
  const extract = async (m: ReadMode) => (await askTab<ExtractReply | undefined>(tabId, { t: "extract", mode: m }))?.reply;
  let reply = await extract(mode);
  if (opts.fallbackToPage && mode === "selection" && (!reply || "error" in reply || !reply.doc.sentences.length)) reply = await extract("page");
  if (!reply) {
    await reportError("page-unreadable", tabId);
    return false;
  }
  if ("error" in reply) {
    await reportError(reply.error, tabId);
    return false;
  }
  if (!reply.doc.sentences.length) {
    await reportError("page-unreadable", tabId);
    return false;
  }
  await runPlayerCommand({ cmd: opts.queue ? "queue-add" : "play", doc: { ...reply.doc, tabId } });
  if (opts.queue) sendToTab(tabId, { t: "toast", message: "Added to queue", kind: "ok", action: "open-sidepanel", actionLabel: "View queue" });
  return true;
}

export async function toggleReader(tabId: number, open: boolean): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId);
  if ((await checkReadable(tab.url)) || siteRule(await loadSettings(), tab.url) === "never-read") return false;
  return (await askTab<unknown>(tabId, { t: "reader", open })) !== null;
}
