/** The browser tabs the Sites section reads: the optional "tabs" permission and the open web pages. Kept out of browser.ts so only the options page loads it. */
const TABS: chrome.permissions.Permissions = { permissions: ["tabs"] };
/** The optional "tabs" permission, which lets the extension read the address of the page in front. */
const tabsCall = async (f: (p: typeof TABS) => Promise<boolean>) => {
  try {
    return await f(TABS);
  } catch {
    return false; // no permissions API, or the user dismissed the prompt
  }
};
export const hasTabsPermission = () => tabsCall((p) => chrome.permissions.contains(p));
export const requestTabsPermission = () => tabsCall((p) => chrome.permissions.request(p));
export const removeTabsPermission = () => tabsCall((p) => chrome.permissions.remove(p));

/** Open http(s) tabs, most recently used first. Empty without the tabs API. */
export async function recentWebTabs(): Promise<chrome.tabs.Tab[]> {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((x) => /^https?:/.test(x.url ?? "")).sort((a, b) => ((b as { lastAccessed?: number }).lastAccessed ?? 0) - ((a as { lastAccessed?: number }).lastAccessed ?? 0));
  } catch {
    return [];
  }
}
