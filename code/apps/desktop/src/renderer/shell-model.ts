import type { Page, SettingsSub } from "../shared/ipc";
import type { ExportOpen } from "./features/export";

export interface Loc {
  page: Page;
  sub: SettingsSub;
}

/** A reading open in the reader, shown inside the library page. */
export interface OpenDoc {
  id: string;
  autoplay: boolean;
}

/** Navigation history plus the overlays of the signed-in window. */
export interface ShellState {
  hist: Loc[];
  at: number;
  side: boolean;
  palette: boolean;
  quit: boolean;
  exporting: ExportOpen | null;
  doc: OpenDoc | null;
  recent: string[];
}

export type ShellAction =
  | { type: "go"; page: Page; sub?: SettingsSub }
  | { type: "back" }
  | { type: "close-settings" }
  | { type: "forward" }
  | { type: "toggle-side" }
  | { type: "palette"; open: boolean }
  | { type: "toggle-palette" }
  | { type: "quit"; open: boolean }
  | { type: "export"; open: ExportOpen | null }
  | { type: "open-doc"; doc: OpenDoc | null }
  | { type: "remember"; text: string };

export const MAX_RECENT = 5;

export const initShell = (recent: string[]): ShellState => ({
  hist: [{ page: "home", sub: "general" }],
  at: 0,
  side: true,
  palette: false,
  quit: false,
  exporting: null,
  doc: null,
  recent,
});

export const currentLoc = (s: ShellState): Loc => s.hist[s.at]!;

/** Moving to another page closes the open reading; moving inside a page (settings sections) keeps it. */
function moveTo(s: ShellState, at: number, hist: Loc[]): ShellState {
  const samePage = hist[at]!.page === currentLoc(s).page;
  return { ...s, hist, at, doc: samePage ? s.doc : null };
}

function go(s: ShellState, page: Page, sub?: SettingsSub): ShellState {
  const cur = currentLoc(s);
  const next: Loc = { page, sub: sub ?? (page === "settings" ? cur.sub : "general") };
  if (cur.page === next.page && cur.sub === next.sub) return s;
  // Moving between settings sections replaces the entry: Back/Forward only walk main pages.
  if (cur.page === "settings" && next.page === "settings") return { ...s, hist: s.hist.map((l, i) => (i === s.at ? next : l)) };
  return moveTo(s, s.at + 1, [...s.hist.slice(0, s.at + 1), next]);
}

/** The text kept in "Recent": one line, 80 characters, newest first, no repeats; blank text changes nothing. */
export function rememberRecent(recent: string[], text: string): string[] {
  const t = text.trim().replace(/\s+/g, " ").slice(0, 80);
  return t ? [t, ...recent.filter((r) => r !== t)].slice(0, MAX_RECENT) : recent;
}

/** Leaves Settings for the page that was open before it (the entry just before it; sections never add entries), dropping the Settings entry. */
function closeSettings(s: ShellState): ShellState {
  if (currentLoc(s).page !== "settings" || s.palette || s.quit || s.exporting) return s;
  if (s.at === 0) return moveTo(s, 0, [{ page: "home", sub: "general" }, ...s.hist.slice(1)]);
  return moveTo(s, s.at - 1, [...s.hist.slice(0, s.at), ...s.hist.slice(s.at + 1)]);
}

type NavAction = Extract<ShellAction, { type: "go" | "back" | "close-settings" | "forward" }>;

/** The actions that only set a flag or a value; navigation is in `shellReducer`. */
function flagReducer(s: ShellState, a: Exclude<ShellAction, NavAction>): ShellState {
  switch (a.type) {
    case "toggle-side":
      return { ...s, side: !s.side };
    case "palette":
      return { ...s, palette: a.open };
    case "toggle-palette":
      return { ...s, palette: !s.palette };
    case "quit":
      return { ...s, quit: a.open };
    case "export":
      return { ...s, exporting: a.open };
    case "open-doc":
      return { ...s, doc: a.doc };
    case "remember":
      return { ...s, recent: rememberRecent(s.recent, a.text) };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

export function shellReducer(s: ShellState, a: ShellAction): ShellState {
  switch (a.type) {
    case "go":
      return go(s, a.page, a.sub);
    case "back":
      return s.at > 0 ? moveTo(s, s.at - 1, s.hist) : s;
    case "close-settings":
      return closeSettings(s);
    case "forward":
      return s.at < s.hist.length - 1 ? moveTo(s, s.at + 1, s.hist) : s;
    default:
      return flagReducer(s, a);
  }
}
