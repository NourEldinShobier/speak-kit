/** The only settings file that calls chrome.*: storage areas, change events, commands and tabs. Everything else in the feature goes through these functions. */
export const storageAvailable = () => typeof chrome !== "undefined" && !!chrome.storage;

export const syncGet = (keys: string | string[]) => chrome.storage.sync.get(keys);
export const syncSet = (items: Record<string, unknown>) => chrome.storage.sync.set(items);
export const localGet = (key: string) => chrome.storage.local.get(key);
export const localSet = (items: Record<string, unknown>) => chrome.storage.local.set(items);
export const localRemove = (key: string) => chrome.storage.local.remove(key);

/** Calls `cb` with the new value when `key` changes in the given area; returns unsubscribe. */
export function onStorageKey(area: "sync" | "local", key: string, cb: (v: unknown) => void): () => void {
  const h = (ch: Record<string, chrome.storage.StorageChange>, name: string) => {
    if (name === area && key in ch) cb(ch[key]?.newValue);
  };
  chrome.storage.onChanged.addListener(h);
  return () => chrome.storage.onChanged.removeListener(h);
}

export type ManifestCommands = Record<string, { suggested_key?: { default?: string } }>;
export function manifestCommands(): ManifestCommands | undefined {
  try {
    return chrome.runtime.getManifest().commands as ManifestCommands | undefined;
  } catch {
    return undefined;
  }
}

/** The extension's commands as Chrome has them; an empty list when the API is missing or fails. */
export async function getCommands(): Promise<chrome.commands.Command[]> {
  try {
    return (await chrome.commands?.getAll()) ?? [];
  } catch {
    return [];
  }
}

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
