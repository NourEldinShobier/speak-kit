import { useEffect, useState } from "react";
import { classifyProbeError } from "../../features/connection";

/** The tab the popup acts on. Test builds accept ?tab=<id> because a popup opened as a tab would otherwise see itself. */
export async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const forced = __TEST__ ? Number(new URLSearchParams(location.search).get("tab")) : 0;
  if (forced) return chrome.tabs.get(forced);
  return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
}

interface TabInfo {
  id?: number;
  url?: string;
  title?: string;
  selection: string;
  chars: number;
  fileAccess: boolean;
}

const fileAccess = () =>
  new Promise<boolean>((res) => {
    try {
      chrome.extension.isAllowedFileSchemeAccess((ok) => res(ok));
    } catch {
      res(true);
    }
  });

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
      let url = tab?.url;
      let selection = "";
      let chars = 0;
      if (tab?.id !== undefined) {
        try {
          const r = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
              sel: String(getSelection() ?? ""),
              chars: ((document.querySelector("article, main, [role=main]") as HTMLElement | null) ?? document.body).innerText.length,
            }),
          });
          const o = r[0]?.result as { sel: string; chars: number } | undefined;
          selection = o?.sel ?? "";
          chars = o?.chars ?? 0;
        } catch (e) {
          const c = classifyProbeError(e instanceof Error ? e.message : String(e));
          if (c?.kind === "file") url = c.url;
          else if (c?.kind === "restricted" && !url) url = "chrome://restricted";
        }
      }
      const fa = await fileAccess();
      if (live) setT({ id: tab?.id, url, title: tab?.title, selection: selection.trim(), chars, fileAccess: fa });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return t;
}
