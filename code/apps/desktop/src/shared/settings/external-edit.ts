import { loadSettings } from "./settings-file";
import type { Config } from "../schemas";

export type ExternalEdit =
  /** The file says what the running app already has (this includes the app's own writes). */
  | { kind: "same" }
  /** The file is not valid JSON right now (an editor is mid-save): keep what runs. */
  | { kind: "unreadable" }
  /** Written by a newer app: the running copy is not changed from it. */
  | { kind: "newer"; version: number }
  | { kind: "changed"; patch: Partial<Config>; keys: string[]; repaired: string[] };

/** Fields that belong to this run, not to the file: they are never taken from an edit. */
const OWN_RUN = new Set(["configVersion", "appliedMigrations"]);

/** Decides what a changed config.json means for the running settings: which top-level fields differ, and their new values. */
export function readExternalEdit(current: Config, fileText: string, keep: readonly string[] = []): ExternalEdit {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    return { kind: "unreadable" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "unreadable" };
  const loaded = loadSettings(parsed);
  if (loaded.newerVersion !== null) return { kind: "newer", version: loaded.newerVersion };
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(loaded.config) as (keyof Config)[]) {
    if (OWN_RUN.has(key) || keep.includes(key)) continue;
    if (JSON.stringify(loaded.config[key]) !== JSON.stringify(current[key])) patch[key] = loaded.config[key];
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) return { kind: "same" };
  return { kind: "changed", patch: patch as Partial<Config>, keys, repaired: loaded.invalidFields };
}
