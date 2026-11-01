import { SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import { parseSettings } from "./schema";
import type { Settings } from "./types";

const SETTINGS_VERSION_KEY = "speakkit.settingsVersion";
const SETTINGS_VERSION = 1;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Migrations by stored version: each upgrades raw data from version n to n+1. Version 1 is the first schema. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

function migrateSettings(raw: unknown, from: number): unknown {
  let cur = raw;
  for (let v = from; v < SETTINGS_VERSION; v++) if (isObj(cur) && MIGRATIONS[v]) cur = MIGRATIONS[v]!(cur);
  return cur;
}

/** Turns anything found in storage into a valid Settings: unknown keys dropped, missing or invalid values defaulted, numbers clamped (valibot, see schema.ts). */
export const normalizeSettings = (raw: unknown): Settings => parseSettings(raw);

/** Merge a partial update into current settings. `sites` is replaced as a whole when present; other groups merge key by key. */
export function mergeSettings(cur: Settings, patch: DeepPartial<Settings>): Settings {
  const out: Record<string, unknown> = { ...cur };
  for (const [key, value] of Object.entries(patch)) {
    const base = (cur as unknown as Record<string, unknown>)[key];
    out[key] = isObj(value) && isObj(base) && key !== "sites" ? { ...base, ...value } : value;
  }
  return normalizeSettings(out);
}

let cache: Settings | undefined;
export const invalidateSettings = () => {
  cache = undefined;
};

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;
  const got = await chrome.storage.sync.get([SETTINGS_KEY, SETTINGS_VERSION_KEY]);
  const from = typeof got[SETTINGS_VERSION_KEY] === "number" ? (got[SETTINGS_VERSION_KEY] as number) : 0;
  return (cache = normalizeSettings(migrateSettings(got[SETTINGS_KEY], from)));
}

export async function saveSettings(patch: DeepPartial<Settings>): Promise<Settings> {
  const next = mergeSettings(await loadSettings(), patch);
  cache = next;
  await chrome.storage.sync.set({ [SETTINGS_KEY]: next, [SETTINGS_VERSION_KEY]: SETTINGS_VERSION });
  return next;
}

/** Write back the normalized form once at install/update so stored data always matches the current schema. */
export async function migrateStoredSettings(): Promise<void> {
  invalidateSettings();
  await saveSettings({});
}

export async function getToken(): Promise<string> {
  const got = await chrome.storage.local.get(TOKEN_KEY);
  return typeof got[TOKEN_KEY] === "string" ? (got[TOKEN_KEY] as string) : "";
}
