import { exeKey } from "../paste-plan";
import type { Settings } from "../settings";
import { mergeTerms, type Term } from "../vocabulary";
import { DEFAULT_TEMPLATE } from "./templates";

/** How dictation behaves in some apps: its own words and an optional rewrite. */
export interface Mode {
  id: string;
  name: string;
  /** Program names without ".exe", lower case. The built-in default mode has none: it takes every program no other mode lists. */
  apps: string[];
  /** Website host names such as "mail.google.com": in a supported browser these pick the mode by the page in front, ahead of `apps`. */
  sites: string[];
  rewrite: boolean;
  /** How the rewrite pass words the text: a built-in template id or the id of a custom style (Tidy when that style is gone). The default mode uses the app default. */
  template: string;
  terms: Term[];
}

export const DEFAULT_MODE_ID = "default";
export const MAX_MODES = 24;
export const MAX_MODE_NAME = 40;

export const defaultMode = (): Mode => ({
  id: DEFAULT_MODE_ID,
  name: "Default",
  apps: [],
  sites: [],
  rewrite: false,
  template: DEFAULT_TEMPLATE,
  terms: [],
});

export type ModeError = "empty" | "too-long" | "duplicate" | "full";

export function addMode(modes: readonly Mode[], name: string): { ok: true; modes: Mode[]; mode: Mode } | { ok: false; error: ModeError } {
  const n = name.trim();
  if (!n) return { ok: false, error: "empty" };
  if ([...n].length > MAX_MODE_NAME) return { ok: false, error: "too-long" };
  if (n.toLowerCase() === defaultMode().name.toLowerCase() || modes.some((m) => m.name.toLowerCase() === n.toLowerCase())) return { ok: false, error: "duplicate" };
  if (modes.length >= MAX_MODES) return { ok: false, error: "full" };
  const mode: Mode = { ...defaultMode(), id: `m${Date.now().toString(36)}${modes.length}`, name: n };
  return { ok: true, modes: [...modes, mode], mode };
}

export const removeMode = (modes: readonly Mode[], id: string): Mode[] => modes.filter((m) => m.id !== id);

/** An app belongs to one mode: adding it to a mode takes it from any other. */
export function setApps(modes: readonly Mode[], id: string, apps: readonly string[]): Mode[] {
  const mine = [...new Set(apps.map(exeKey).filter(Boolean))];
  return modes.map((m) => (m.id === id ? { ...m, apps: mine } : { ...m, apps: m.apps.filter((a) => !mine.includes(a)) }));
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

/** Sites belong to one mode: giving them to a mode takes them from any other. */
export function setSites(modes: readonly Mode[], id: string, sites: readonly string[]): Mode[] {
  const mine = [...new Set(sites.map(normalizeSite).filter(Boolean))];
  return modes.map((m) => (m.id === id ? { ...m, sites: mine } : { ...m, sites: m.sites.filter((x) => !mine.includes(x)) }));
}

/**
 * The mode for the program in front, and the page in it when the browser reports one. The mode that lists the most specific matching site wins,
 * then the first mode that lists the program, else the built-in default.
 */
export function resolveMode(modes: readonly Mode[], exe: string | undefined, site?: string): Mode {
  const key = exe ? exeKey(exe) : "";
  const host = site && reportsPages(exe) ? normalizeSite(site) : "";
  let bySite: Mode | undefined;
  let longest = 0;
  if (host) for (const m of modes) for (const s of m.sites) if (s.length > longest && siteMatches(s, host)) [bySite, longest] = [m, s.length];
  return bySite || (key && modes.find((m) => m.apps.includes(key))) || defaultMode();
}

export type ModeSettings = Pick<Settings, "terms">;

/** The words for one dictation: the person's settings, with the mode's own on top. The default mode changes nothing. */
export function applyMode<S extends ModeSettings>(base: S, mode: Mode): S & { rewrite: boolean; template: string } {
  if (mode.id === DEFAULT_MODE_ID) return { ...base, rewrite: mode.rewrite, template: mode.template };
  return { ...base, terms: mergeTerms(base.terms, mode.terms), rewrite: mode.rewrite, template: mode.template };
}

/** Words that tell a row how many apps and words a mode has, for the list. */
export const modeSummary = (m: Mode): { apps: number; sites: number; words: number; rewrite: boolean } => ({ apps: m.apps.length, sites: m.sites.length, words: m.terms.length, rewrite: m.rewrite });
