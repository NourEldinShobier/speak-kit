import { AREA_NAMES, validateChange } from "../control/settings-registry";

/** What belongs to one install and is never carried over by an import: how far setup got, the capture consent, the folder and the program a capture runs for narration. */
const THIS_INSTALL = ["setupDone", "setupSkipped", "setupStep", "capture.consented", "capture.folder", "capture.narrationCommand"];

const anyOn = (v: unknown) => !!v && typeof v === "object" && Object.values(v).includes(true);

/** Settings that switch on something reaching beyond the app (a local server, an experiment, tools for AI apps, input logging, text sent out). An import that would change one to on asks first. */
export const NEEDS_CONFIRMATION: Readonly<Record<string, { what: string; on(value: unknown): boolean }>> = {
  controlServer: { what: "the local control server for the command line and AI apps", on: (v) => v === true },
  experiments: { what: "experiments", on: anyOn },
  mcpTools: { what: "the tools offered to AI apps", on: anyOn },
  "capture.experiments": { what: "capture experiments", on: anyOn },
  "capture.inputLog": { what: "the capture input log", on: (v) => v === "events" },
  "meetings.summary": { what: "meeting summaries written by an online service", on: (v) => v === true },
  "dictation.rewrite": { what: "rewriting dictated text", on: (v) => (v as { enabled?: unknown } | null)?.enabled === true },
};

/** Assigning this key would change the prototype of the object the registry builds. */
const NEVER = "__proto__";

/** Large enough for every setting with a long word list; a bigger file is not a settings file. */
export const MAX_IMPORT_BYTES = 2_000_000;

export type ImportPlan = { ok: true; change: Record<string, unknown>; skipped: string[]; needsConfirmation: string[]; changed: string[] } | { ok: false; message: string };

const NESTED = [...AREA_NAMES, "dictation", "shortcuts"];

/** The settings file nests each feature's settings under its name; the registry names them `<feature>.<key>`. */
export function flatten(file: Record<string, unknown>): [string, unknown][] {
  return Object.entries(file).flatMap(([key, value]): [string, unknown][] => {
    if (NESTED.includes(key) && value && typeof value === "object" && !Array.isArray(value)) return Object.entries(value).map(([k, x]) => [`${key}.${k}`, x]);
    return [[key, value]];
  });
}

/**
 * What an imported settings file would change: every setting the registry accepts, and the names of those it does not (unknown, invalid or install-specific).
 * One bad setting does not stop the others; a file with nothing usable is refused.
 * `current` is the settings now in use (the same shape as the file); it tells which of the imported settings differ from what is set.
 */
export function planImport(text: string, current: Record<string, unknown> = {}): ImportPlan {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, message: "the file is too large to be a settings file." };
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, message: "the file is not valid JSON." };
  }
  if (!file || typeof file !== "object" || Array.isArray(file)) return { ok: false, message: "the file does not hold settings." };
  const change: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const [key, value] of flatten(file as Record<string, unknown>)) {
    const r = THIS_INSTALL.includes(key) || key.endsWith(NEVER) ? undefined : validateChange({ [key]: value });
    if (r?.ok) change[key] = value;
    else skipped.push(key);
  }
  if (Object.keys(change).length === 0) return { ok: false, message: "the file has no settings that can be imported." };
  const now = new Map(flatten(current));
  const changed = Object.keys(change).filter((k) => JSON.stringify(now.get(k)) !== JSON.stringify(change[k]));
  const needsConfirmation = changed.filter((k) => Object.hasOwn(NEEDS_CONFIRMATION, k) && NEEDS_CONFIRMATION[k]!.on(change[k]));
  return { ok: true, change, skipped, needsConfirmation, changed };
}
