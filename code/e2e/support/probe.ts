import type { Page } from "@playwright/test";
import type { PlayerState } from "@speakkit/protocol";
import type { Ext } from "./ext";

type Mode = "page" | "selection" | "from-here";
export interface Probed {
  sentences: string[];
  blocks: number[];
  error?: string;
}

/** What the content script would hand the player for this tab: asks it the way the service worker does, without playing anything. */
export async function extractOf(ext: Ext, page: Page, mode: Mode = "page"): Promise<Probed> {
  const tabId = await ext.tabId(page);
  return ext.sw.evaluate(
    async ([t, m]) => {
      const r = (await chrome.tabs.sendMessage(t, { t: "extract", mode: m })) as { doc?: { sentences: { text: string; block: number }[] }; error?: string };
      return r.doc ? { sentences: r.doc.sentences.map((s) => s.text), blocks: r.doc.sentences.map((s) => s.block) } : { sentences: [], blocks: [], error: r.error ?? "none" };
    },
    [tabId, mode] as const,
  );
}

/** Start a read of this tab the way the popup and the shortcut do. */
export async function readTab(ext: Ext, page: Page, mode: Mode = "page"): Promise<{ ok: boolean }> {
  return ext.bg<{ ok: boolean }>({ t: "read-tab", tabId: await ext.tabId(page), mode });
}

export const stateOf = async (ext: Ext): Promise<{ status: PlayerState["status"]; tabId: number | undefined; sentenceIndex: number; sentenceCount: number; code?: string }> => {
  const s = await ext.bgState();
  return { status: s.status, tabId: s.tabId, sentenceIndex: s.sentenceIndex, sentenceCount: s.sentenceCount, ...(s.error ? { code: s.error.code } : {}) };
};

/** Select the contents of an element, or from one node's start to another's end, in the page. */
export const selectBetween = (page: Page, from: string, to: string) =>
  page.evaluate(
    ([a, b]) => {
      const r = document.createRange();
      r.setStart(document.querySelector(a!)!, 0);
      const end = document.querySelector(b!)!;
      r.setEnd(end, end.childNodes.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    },
    [from, to] as const,
  );

/** Every sentence the fake engine was asked to speak, in order. */
export const spoken = (app: { engine: { calls: { text: string }[] } }) => app.engine.calls.map((c) => c.text);
