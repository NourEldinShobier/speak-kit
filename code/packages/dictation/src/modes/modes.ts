import { exeKey } from "../paste-plan";
import type { InsertMode, Settings } from "../settings";
import { mergeTerms, type Term } from "../vocabulary";

export type Capitals = "keep" | "sentence" | "lower";
export type EndOfDictation = "keep" | "no-full-stop";

/** How dictation behaves in some apps: how text is inserted, capitals, the end of the sentence, its own words and an optional rewrite. */
export interface Mode {
  id: string;
  name: string;
  /** Program names without ".exe", lower case. The default mode has none: it takes every program no other mode lists. */
  apps: string[];
  insertMode: InsertMode;
  capitals: Capitals;
  end: EndOfDictation;
  rewrite: boolean;
  terms: Term[];
}

export const DEFAULT_MODE_ID = "default";
export const MAX_MODES = 24;
export const MAX_MODE_NAME = 40;

export const defaultMode = (): Mode => ({ id: DEFAULT_MODE_ID, name: "Default", apps: [], insertMode: "paste", capitals: "sentence", end: "keep", rewrite: false, terms: [] });

export type ModeError = "empty" | "too-long" | "duplicate" | "full";

export function addMode(modes: readonly Mode[], name: string): { ok: true; modes: Mode[]; mode: Mode } | { ok: false; error: ModeError } {
  const n = name.trim();
  if (!n) return { ok: false, error: "empty" };
  if ([...n].length > MAX_MODE_NAME) return { ok: false, error: "too-long" };
  if (modes.some((m) => m.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: "duplicate" };
  if (modes.length >= MAX_MODES) return { ok: false, error: "full" };
  const mode: Mode = { ...defaultMode(), id: `m${Date.now().toString(36)}${modes.length}`, name: n, capitals: "keep" };
  return { ok: true, modes: [...modes, mode], mode };
}

/** The default mode is always there and cannot be deleted. */
export const removeMode = (modes: readonly Mode[], id: string): Mode[] => (id === DEFAULT_MODE_ID ? [...modes] : modes.filter((m) => m.id !== id));

/** An app belongs to one mode: adding it to a mode takes it from any other. */
export function setApps(modes: readonly Mode[], id: string, apps: readonly string[]): Mode[] {
  const mine = [...new Set(apps.map(exeKey).filter(Boolean))];
  return modes.map((m) => {
    if (m.id === id) return { ...m, apps: mine };
    // The default mode lists no apps; any other mode gives up the ones that moved.
    return id === DEFAULT_MODE_ID ? m : { ...m, apps: m.apps.filter((a) => !mine.includes(a)) };
  });
}

/** The mode for a program: the first that lists it, else the default. */
export function resolveMode(modes: readonly Mode[], exe: string | undefined): Mode {
  const key = exe ? exeKey(exe) : "";
  return (key && modes.find((m) => m.id !== DEFAULT_MODE_ID && m.apps.includes(key))) || modes.find((m) => m.id === DEFAULT_MODE_ID) || defaultMode();
}

export type ModeSettings = Pick<Settings, "autoCapitalize" | "lowercase" | "stripFinalStop" | "insertMode" | "terms">;

/** The rule switches for one dictation: the person's settings, with the mode's own choices on top. The default mode changes nothing. */
export function applyMode<S extends ModeSettings>(base: S, mode: Mode): S & { rewrite: boolean } {
  if (mode.id === DEFAULT_MODE_ID) return { ...base, rewrite: mode.rewrite };
  return {
    ...base,
    autoCapitalize: mode.capitals === "sentence",
    lowercase: mode.capitals === "lower",
    stripFinalStop: mode.end === "no-full-stop",
    insertMode: mode.insertMode,
    terms: mergeTerms(base.terms, mode.terms),
    rewrite: mode.rewrite,
  };
}

/** Words that tell a row how many apps and words a mode has, for the list. */
export const modeSummary = (m: Mode): { apps: number; words: number; rewrite: boolean } => ({ apps: m.apps.length, words: m.terms.length, rewrite: m.rewrite });
