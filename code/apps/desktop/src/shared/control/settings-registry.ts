import { VOICE_CHAT_VOICES } from "@speakkit/protocol";
import * as v from "valibot";
import { DictationPatchSchema, type DictationPatch } from "../dictation/settings";
import { ConfigPatchSchema, type ConfigPatch } from "../schemas";
import { SHORTCUT_IDS, checkAccelerator, normalize, type ShortcutId } from "../shortcuts";
import { EnginesPatchSchema } from "../speech-models/config";
import { TranscriptsPatchSchema } from "../transcripts/settings";

/** The feature areas that keep their settings under their own key of the settings file; a change names them `<area>.<key>`. */
export const AREA_SCHEMAS = { transcripts: TranscriptsPatchSchema, engines: EnginesPatchSchema } as const;
export type AreaName = keyof typeof AREA_SCHEMAS;

/** Settings that have their own owner and are not part of `ConfigPatch`: the login item and the voice chat voice. */
export const SYSTEM_KEYS = ["launchAtLogin", "voiceChatVoice"] as const;
const SystemSchema = v.partial(v.strictObject({ launchAtLogin: v.boolean(), voiceChatVoice: v.picklist(VOICE_CHAT_VOICES) }));
export type SystemPatch = v.InferOutput<typeof SystemSchema>;

export type AreaPatches = { [A in AreaName]?: Record<string, unknown> };
export type SettingsChange =
  | { ok: true; app: ConfigPatch; dictation: DictationPatch; areas: AreaPatches; shortcuts: Partial<Record<ShortcutId, string>>; resetShortcuts: boolean; system: SystemPatch }
  | { ok: false; message: string };

/**
 * The one validator for a change of settings, whoever asks: the Settings pages and an import both end up here.
 * Keys are the app's own (`voice`, `speed`), `dictation.<key>`, `<area>.<key>` for transcripts and engines, `shortcuts.<id>` or `launchAtLogin`; anything else, or a value the page would refuse, is refused whole and nothing is applied.
 */
export function validateChange(change: Readonly<Record<string, unknown>>): SettingsChange {
  const g = groupKeys(change);
  if (!g.ok) return g;
  const a = v.safeParse(ConfigPatchSchema, g.app);
  if (!a.success) return { ok: false, message: describe(a.issues) };
  const d = v.safeParse(DictationPatchSchema, g.dictation);
  if (!d.success) return { ok: false, message: describe(d.issues, "dictation.") };
  const sys = v.safeParse(SystemSchema, g.system);
  if (!sys.success) return { ok: false, message: describe(sys.issues) };
  const reset = v.safeParse(v.optional(v.literal("default")), g.reset);
  if (!reset.success) return { ok: false, message: 'shortcuts: only "default" is accepted.' };
  const areas = validateAreas(g.areas);
  if (!areas.ok) return areas;
  const shortcuts = validateShortcuts(g.shortcuts);
  if (!shortcuts.ok) return shortcuts;
  return { ok: true, app: a.output, dictation: d.output, areas: areas.areas, shortcuts: shortcuts.shortcuts, resetShortcuts: reset.output === "default", system: sys.output };
}

type Bag = Record<string, unknown>;
type Refused = { ok: false; message: string };

/** Sorts the keys of a change by who stores them; a key that would reach the prototype is refused. The bare key `shortcuts` (value "default") puts every shortcut back. */
function groupKeys(change: Readonly<Bag>): { ok: true; app: Bag; dictation: Bag; system: Bag; areas: Record<string, Bag>; shortcuts: Bag; reset?: unknown } | Refused {
  const g: { ok: true; app: Bag; dictation: Bag; system: Bag; areas: Record<string, Bag>; shortcuts: Bag; reset?: unknown } = {
    ok: true,
    app: {},
    dictation: {},
    system: {},
    areas: {},
    shortcuts: {},
  };
  for (const [key, value] of Object.entries(change)) {
    const dot = key.indexOf(".");
    const head = dot < 0 ? "" : key.slice(0, dot);
    const rest = key.slice(dot + 1);
    if (key === "__proto__" || rest === "__proto__") return { ok: false, message: `${key} is not a setting.` };
    if (key === "shortcuts") g.reset = value;
    else if (head === "dictation") g.dictation[rest] = value;
    else if (head === "shortcuts") g.shortcuts[rest] = value;
    else if (Object.hasOwn(AREA_SCHEMAS, head)) (g.areas[head] ??= {})[rest] = value;
    else if ((SYSTEM_KEYS as readonly string[]).includes(key)) g.system[key] = value;
    else g.app[key] = value;
  }
  return g;
}

function validateAreas(parts: Record<string, Bag>): { ok: true; areas: AreaPatches } | Refused {
  const areas: Record<string, Bag> = {};
  for (const [name, patch] of Object.entries(parts)) {
    const r = v.safeParse(AREA_SCHEMAS[name as AreaName], patch);
    if (!r.success) return { ok: false, message: describe(r.issues, `${name}.`) };
    areas[name] = r.output as Bag;
  }
  return { ok: true, areas: areas as AreaPatches };
}

function validateShortcuts(given: Bag): { ok: true; shortcuts: Partial<Record<ShortcutId, string>> } | Refused {
  const shortcuts: Partial<Record<ShortcutId, string>> = {};
  for (const [id, accelerator] of Object.entries(given)) {
    if (!(SHORTCUT_IDS as readonly string[]).includes(id)) return { ok: false, message: `shortcuts.${id}: not a shortcut.` };
    if (typeof accelerator !== "string" || checkAccelerator(accelerator) !== null) return { ok: false, message: `shortcuts.${id}: not a usable shortcut.` };
    shortcuts[id as ShortcutId] = normalize(accelerator)!;
  }
  return { ok: true, shortcuts };
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
