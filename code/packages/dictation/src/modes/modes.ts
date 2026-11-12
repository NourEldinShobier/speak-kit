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
  /** Website host names such as "mail.google.com": in a supported browser these pick the mode by the page in front, ahead of `apps`. */
  sites: string[];
  insertMode: InsertMode;
  capitals: Capitals;
  end: EndOfDictation;
  rewrite: boolean;
  terms: Term[];
}

export const DEFAULT_MODE_ID = "default";
export const MAX_MODES = 24;
export const MAX_MODE_NAME = 40;

export const defaultMode = (): Mode => ({ id: DEFAULT_MODE_ID, name: "Default", apps: [], sites: [], insertMode: "paste", capitals: "sentence", end: "keep", rewrite: false, terms: [] });

/** The list with the default mode in it, first: the one that was saved, or the built-in one when nothing about it was ever changed. */
export const withDefault = (modes: readonly Mode[]): Mode[] => [modes.find((m) => m.id === DEFAULT_MODE_ID) ?? defaultMode(), ...modes.filter((m) => m.id !== DEFAULT_MODE_ID)];

/** The list as saved: the default mode only when the person changed something about it, so a config that never touched it stays as it was. */
export const withoutPristineDefault = (modes: readonly Mode[]): Mode[] => modes.filter((m) => m.id !== DEFAULT_MODE_ID || JSON.stringify(m) !== JSON.stringify(defaultMode()));

export type ModeError = "empty" | "too-long" | "duplicate" | "full";

export function addMode(modes: readonly Mode[], name: string): { ok: true; modes: Mode[]; mode: Mode } | { ok: false; error: ModeError } {
  const n = name.trim();
  if (!n) return { ok: false, error: "empty" };
  if ([...n].length > MAX_MODE_NAME) return { ok: false, error: "too-long" };
  if (n.toLowerCase() === defaultMode().name.toLowerCase() || modes.some((m) => m.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: "duplicate" };
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

/** A site as the person typed it ("https://Example.com/inbox") reduced to its host name; "" when it is not a host name. */
export function normalizeSite(input: string): string {
  const text = input.trim();
  if (!text || /\s/.test(text)) return "";
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`).hostname;
  } catch {
    return "";
  }
  host = host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  return host === "localhost" || /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,}$/.test(host) ? host : "";
}

/** A listed site covers its own host and every host under it: "google.com" covers "mail.google.com". */
export const siteMatches = (site: string, host: string): boolean => host === site || host.endsWith(`.${site}`);

/** Browsers that can report the page in front (the extension runs in these). Names as `exeKey` gives them, plus macOS bundle ids. */
const PAGE_BROWSERS = new Set([
  "chrome",
  "msedge",
  "brave",
  "vivaldi",
  "opera",
  "arc",
  "chromium",
  "com.google.chrome",
  "com.microsoft.edgemac",
  "com.brave.browser",
  "com.vivaldi.vivaldi",
  "com.operasoftware.opera",
  "company.thebrowser.browser",
  "org.chromium.chromium",
]);
export const reportsPages = (exe: string | undefined): boolean => !!exe && PAGE_BROWSERS.has(exeKey(exe));

/** Sites belong to one mode: giving them to a mode takes them from any other. The default mode lists no sites. */
export function setSites(modes: readonly Mode[], id: string, sites: readonly string[]): Mode[] {
  const mine = [...new Set(sites.map(normalizeSite).filter(Boolean))];
  return modes.map((m) => {
    if (m.id === DEFAULT_MODE_ID) return m;
    return m.id === id ? { ...m, sites: mine } : { ...m, sites: m.sites.filter((x) => !mine.includes(x)) };
  });
}

/**
 * The mode for the program in front, and the page in it when the browser reports one. The mode that lists the most specific matching site wins,
 * then the first mode that lists the program, else the default.
 */
export function resolveMode(modes: readonly Mode[], exe: string | undefined, site?: string): Mode {
  const key = exe ? exeKey(exe) : "";
  const host = site && reportsPages(exe) ? normalizeSite(site) : "";
  let bySite: Mode | undefined;
  let longest = 0;
  if (host)
    for (const m of modes) {
      if (m.id === DEFAULT_MODE_ID) continue;
      for (const s of m.sites) if (s.length > longest && siteMatches(s, host)) [bySite, longest] = [m, s.length];
    }
  return bySite || (key && modes.find((m) => m.id !== DEFAULT_MODE_ID && m.apps.includes(key))) || modes.find((m) => m.id === DEFAULT_MODE_ID) || defaultMode();
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
export const modeSummary = (m: Mode): { apps: number; sites: number; words: number; rewrite: boolean } => ({ apps: m.apps.length, sites: m.sites.length, words: m.terms.length, rewrite: m.rewrite });
