import * as v from "valibot";
import { ConfigSchema, parseConfig, unwrappedField, type Config } from "../schemas";

/** Format version written to config.json. A file with a higher number was written by a newer app and is never rewritten. */
export const CONFIG_VERSION = 1;

export interface Migration {
  id: string;
  run(raw: Record<string, unknown>): Record<string, unknown>;
}

/** One-time fixes to the stored file, by id. Add to the end; an applied id is remembered in the file and never runs again. */
export const MIGRATIONS: readonly Migration[] = [];

export type SettingsNotice = { kind: "repaired"; fields: string[] } | { kind: "newer"; version: number };

export interface LoadedSettings {
  config: Config;
  /** Top-level fields that held a bad value and loaded as their default. */
  invalidFields: string[];
  /** Set when the file's version is newer than this app's. */
  newerVersion: number | null;
  /** True when the first save would change the file's content beyond adding what is new: the original is then backed up. */
  needsBackup: boolean;
}

/** Applies each migration whose id is not yet in `applied`, in order. Returns the new content and the full list of applied ids. */
export function runMigrations(raw: Record<string, unknown>, applied: readonly string[], list: readonly Migration[] = MIGRATIONS): { raw: Record<string, unknown>; applied: string[] } {
  const done = new Set(applied);
  let out = raw;
  for (const m of list) {
    if (done.has(m.id)) continue;
    out = m.run({ ...out });
    done.add(m.id);
  }
  return { raw: out, applied: [...done] };
}

/** Names of the fields in `raw` whose stored value is not valid (they load as their default). Unknown keys are ignored. */
export function invalidFieldsOf(raw: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const [key, schema] of Object.entries(ConfigSchema.entries)) {
    if (!(key in raw)) continue;
    if (!v.safeParse(unwrappedField(schema), raw[key]).success) bad.push(key);
  }
  return bad;
}

/** Reads whatever is stored: migrates, repairs bad fields, and notices a file written by a newer app. */
export function loadSettings(stored: unknown, list: readonly Migration[] = MIGRATIONS): LoadedSettings {
  const raw = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const version = typeof raw.configVersion === "number" && Number.isFinite(raw.configVersion) ? raw.configVersion : 1;
  const invalidFields = invalidFieldsOf(raw);
  if (version > CONFIG_VERSION) return { config: parseConfig(raw), invalidFields, newerVersion: version, needsBackup: false };
  const applied = Array.isArray(raw.appliedMigrations) ? raw.appliedMigrations.filter((x): x is string => typeof x === "string") : [];
  const migrated = runMigrations(raw, applied, list);
  const config = parseConfig({ ...migrated.raw, appliedMigrations: migrated.applied, configVersion: CONFIG_VERSION });
  const changed = migrated.applied.length !== applied.length;
  return { config, invalidFields, newerVersion: null, needsBackup: invalidFields.length > 0 || changed };
}

export function noticeOf(l: Pick<LoadedSettings, "invalidFields" | "newerVersion">): SettingsNotice | null {
  if (l.newerVersion !== null) return { kind: "newer", version: l.newerVersion };
  return l.invalidFields.length ? { kind: "repaired", fields: l.invalidFields } : null;
}

/** Plain-language line for the banner. */
export function noticeText(n: SettingsNotice): string {
  if (n.kind === "newer")
    return "Your settings file was saved by a newer version of Speak Kit. It is read but not changed: changes you make now are not saved and are lost when Speak Kit closes. Update Speak Kit to edit settings.";
  const list = n.fields.slice(0, 4).join(", ") + (n.fields.length > 4 ? ` and ${n.fields.length - 4} more` : "");
  return `Some saved settings were not valid and use their defaults: ${list}. The original file is kept as a backup.`;
}
