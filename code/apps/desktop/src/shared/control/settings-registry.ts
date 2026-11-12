import * as v from "valibot";
import { DictationPatchSchema, type DictationPatch } from "../dictation/settings";
import { ConfigPatchSchema, type ConfigPatch } from "../schemas";

/** The app settings the command line may change: plain values with no side effect to run. */
export const COMMAND_LINE_KEYS = ["voice", "speed", "controlServer"] as const;

export type SettingsChange = { ok: true; app: ConfigPatch; dictation: DictationPatch } | { ok: false; message: string };

/**
 * The one validator for a change of settings, whoever asks: the Settings pages, the command line and an import all end up here.
 * Keys are the app's own (`voice`, `speed`) or `dictation.<key>`; anything else, or a value the page would refuse, is refused whole and nothing is applied.
 */
export function validateChange(change: Readonly<Record<string, unknown>>, only?: readonly string[]): SettingsChange {
  const app: Record<string, unknown> = {};
  const dictation: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(change)) {
    if (key.startsWith("dictation.")) dictation[key.slice("dictation.".length)] = value;
    else app[key] = value;
  }
  const outside = only ? Object.keys(app).find((k) => !only.includes(k)) : undefined;
  if (outside) return { ok: false, message: `${outside} cannot be changed from the command line.` };
  const a = v.safeParse(ConfigPatchSchema, app);
  if (!a.success) return { ok: false, message: describe(a.issues) };
  const d = v.safeParse(DictationPatchSchema, dictation);
  if (!d.success) return { ok: false, message: describe(d.issues, "dictation.") };
  return { ok: true, app: a.output, dictation: d.output };
}

function describe(issues: readonly v.BaseIssue<unknown>[], prefix = ""): string {
  const issue = issues[0]!;
  const key = issue.path?.map((p) => String(p.key)).join(".");
  return key ? `${prefix}${key}: ${issue.message}` : issue.message;
}

/** Keys of an object in alphabetical order, deep, so a settings file reads and diffs the same every time. */
export function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as T;
  if (!value || typeof value !== "object") return value;
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b, "en"));
  return Object.fromEntries(keys.map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])) as T;
}
