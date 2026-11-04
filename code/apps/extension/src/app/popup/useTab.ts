import { useEffect, useState } from "react";
import { classifyProbeError } from "../../features/connection";

/** The tab the popup acts on. Test builds accept ?tab=<id> because a popup opened as a tab would otherwise see itself. */
export async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const forced = __TEST__ ? Number(new URLSearchParams(location.search).get("tab")) : 0;
  if (forced) return chrome.tabs.get(forced);
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}

export interface TabInfo {
  id?: number | undefined;
  url?: string | undefined;
  title?: string | undefined;
  selection: string;
  chars: number;
  fileAccess: boolean;
  hidden?: boolean | undefined;
}

const fileAccess = () =>
  new Promise<boolean>((res) => {
    try {
      chrome.extension.isAllowedFileSchemeAccess((ok) => res(ok));
    } catch {
      res(true);
    }
  });

interface Probe {
  url?: string | undefined;
  selection: string;
  chars: number;
  /** the in-page UI of the tab was closed with its close button (the content script sets the flag on its slot, which this probe shares) */
  hidden?: boolean | undefined;
}

/** Runs in the page: the selection and the amount of readable text. */
const readPage = () => ({
  hidden: (window as { __speakkitContent?: { closed?: boolean } }).__speakkitContent?.closed,
  sel: String(getSelection() ?? ""),
  chars: ((document.querySelector("article, main, [role=main]") as HTMLElement | null) ?? document.body).innerText.length,
});

function urlAfterFailedProbe(url: string | undefined, e: unknown): string | undefined {
  const c = classifyProbeError(e instanceof Error ? e.message : String(e));
  if (c?.kind === "file") return c.url;
  return c?.kind === "restricted" && !url ? "chrome://restricted" : url;
}

/** Reads the selection and text size of a tab. A tab the extension cannot script hides or names its URL in the error (classifyProbeError). */
async function probeTab(tab: chrome.tabs.Tab | undefined): Promise<Probe> {
  const probe: Probe = { url: tab?.url, selection: "", chars: 0 };
  if (tab?.id === undefined) return probe;
  try {
    const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
    const o = r[0]?.result as { sel: string; chars: number; hidden?: boolean } | undefined;
    return { ...probe, selection: (o?.sel ?? "").trim(), chars: o?.chars ?? 0, hidden: o?.hidden };
  } catch (e) {
    return { ...probe, url: urlAfterFailedProbe(probe.url, e) };
  }
}

/**
 * Reads the active tab: URL, title, current selection and the amount of readable text. The probe doubles as the file:// check:
 * a file tab the extension may not access hides its URL, and the probe's error names it (classifyProbeError).
 */
export function useTab(): TabInfo {
  const [t, setT] = useState<TabInfo>({ selection: "", chars: 0, fileAccess: true });
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.tabs) return;
    let live = true;
    (async () => {
      const tab = await activeTab();
      if (!live) return;
      const probe = await probeTab(tab);
      const fa = await fileAccess();
      if (live) setT({ id: tab?.id, title: tab?.title, fileAccess: fa, ...probe });
    })().catch(() => {
      /* no readable tab (closed while the popup opened): the empty state stays */
    });
    return () => {
      live = false;
    };
  }, []);
  return t;
}
