import { SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import { parseSettings } from "./schema";
import type { Settings } from "./types";

/** Page-side (popup, options, side panel) access to chrome.storage. The service worker has its own cached copy in store.ts. */
const has = () => typeof chrome !== "undefined" && !!chrome.storage;

export async function readSettings(): Promise<Settings> {
  if (!has()) return parseSettings({});
  const r = await chrome.storage.sync.get(SETTINGS_KEY);
  return parseSettings(r[SETTINGS_KEY]);
}
export async function writeSettings(s: Settings): Promise<void> {
  if (has()) await chrome.storage.sync.set({ [SETTINGS_KEY]: s });
}
export async function readToken(): Promise<string> {
  if (!has()) return "";
  const r = await chrome.storage.local.get(TOKEN_KEY);
  return typeof r[TOKEN_KEY] === "string" ? (r[TOKEN_KEY] as string) : "";
}
export async function writeToken(t: string): Promise<void> {
  if (!has()) return;
  if (t) await chrome.storage.local.set({ [TOKEN_KEY]: t });
  else await chrome.storage.local.remove(TOKEN_KEY);
}

/** Live updates for one storage key; returns unsubscribe. */
export function watchKey(area: "sync" | "local", key: string, cb: (v: unknown) => void): () => void {
  if (!has()) return () => {};
  const h = (ch: Record<string, chrome.storage.StorageChange>, name: string) => {
    if (name === area && key in ch) cb(ch[key]?.newValue);
  };
  chrome.storage.onChanged.addListener(h);
  return () => chrome.storage.onChanged.removeListener(h);
}

/** "sk_local_........c42e" style mask: keep a recognisable prefix and the last 4 characters. */
export function maskToken(t: string): string {
  if (!t) return "";
  const tail = t.slice(-4);
  const m = /^[a-z]+_[a-z]+_/.exec(t);
  const head = m ? m[0] : "";
  return `${head}${"•".repeat(8)}${tail}`;
}
