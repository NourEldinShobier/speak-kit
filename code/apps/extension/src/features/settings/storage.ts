import { SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import { localGet, localRemove, localSet, onStorageKey, storageAvailable, syncGet, syncSet } from "./browser";
import { parseSettings } from "./schema";
import type { Settings } from "./types";

/** Page-side (popup, options, side panel) access to chrome.storage. The service worker has its own cached copy in store.ts. */
export async function readSettings(): Promise<Settings> {
  if (!storageAvailable()) return parseSettings({});
  const r = await syncGet(SETTINGS_KEY);
  return parseSettings(r[SETTINGS_KEY]);
}
export async function writeSettings(s: Settings): Promise<void> {
  if (storageAvailable()) await syncSet({ [SETTINGS_KEY]: s });
}
export async function readToken(): Promise<string> {
  if (!storageAvailable()) return "";
  const r = await localGet(TOKEN_KEY);
  return typeof r[TOKEN_KEY] === "string" ? (r[TOKEN_KEY] as string) : "";
}
export async function writeToken(t: string): Promise<void> {
  if (!storageAvailable()) return;
  if (t) await localSet({ [TOKEN_KEY]: t });
  else await localRemove(TOKEN_KEY);
}

/** Live updates for one storage key; returns unsubscribe. */
export function watchKey(area: "sync" | "local", key: string, cb: (v: unknown) => void): () => void {
  return storageAvailable() ? onStorageKey(area, key, cb) : () => {};
}

/** "sk_local_........c42e" style mask: keep a recognisable prefix and the last 4 characters. */
export function maskToken(t: string): string {
  if (!t) return "";
  const tail = t.slice(-4);
  const m = /^[a-z]+_[a-z]+_/.exec(t);
  const head = m ? m[0] : "";
  return `${head}${"•".repeat(8)}${tail}`;
}
