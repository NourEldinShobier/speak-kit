import { validateChange } from "../control/settings-registry";

/** The state of one install (how far its setup got) is never carried over by an import. */
const THIS_INSTALL = ["setupDone", "setupSkipped", "setupStep"];

/** Assigning this key would change the prototype of the object the registry builds. */
const NEVER = "__proto__";

/** Large enough for every setting with a long word list; a bigger file is not a settings file. */
export const MAX_IMPORT_BYTES = 2_000_000;

export type ImportPlan = { ok: true; change: Record<string, unknown>; skipped: string[] } | { ok: false; message: string };

/** The settings file nests dictation settings under `dictation`; the registry names them `dictation.<key>`. */
function flatten(file: Record<string, unknown>): [string, unknown][] {
  return Object.entries(file).flatMap(([key, value]): [string, unknown][] => {
    if (key === "dictation" && value && typeof value === "object" && !Array.isArray(value)) return Object.entries(value).map(([k, x]) => [`dictation.${k}`, x]);
    return [[key, value]];
  });
}

/**
 * What an imported settings file would change: every setting the registry accepts, and the names of those it does not (unknown, invalid or install-specific).
 * One bad setting does not stop the others; a file with nothing usable is refused.
 */
export function planImport(text: string): ImportPlan {
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
  return { ok: true, change, skipped };
}
