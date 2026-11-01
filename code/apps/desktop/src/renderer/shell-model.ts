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
  /** Text of the "New reading" dialog; null when closed. */
  reading: string | null;
  quit: boolean;
  exporting: ExportOpen | null;
  doc: OpenDoc | null;
  recent: string[];
}

export type ShellAction =
  | { type: "go"; page: Page; sub?: SettingsSub }
  | { type: "back" }
  | { type: "forward" }
  | { type: "toggle-side" }
  | { type: "palette"; open: boolean }
  | { type: "toggle-palette" }
  | { type: "open-reading"; text: string }
  | { type: "close-reading" }
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
  reading: null,
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
  return moveTo(s, s.at + 1, [...s.hist.slice(0, s.at + 1), next]);
}

/** The text kept in "Recent": one line, 80 characters, newest first, no repeats; blank text changes nothing. */
export function rememberRecent(recent: string[], text: string): string[] {
  const t = text.trim().replace(/\s+/g, " ").slice(0, 80);
  return t ? [t, ...recent.filter((r) => r !== t)].slice(0, MAX_RECENT) : recent;
}

export function shellReducer(s: ShellState, a: ShellAction): ShellState {
  switch (a.type) {
    case "go":
      return go(s, a.page, a.sub);
    case "back":
      return s.at > 0 ? moveTo(s, s.at - 1, s.hist) : s;
    case "forward":
      return s.at < s.hist.length - 1 ? moveTo(s, s.at + 1, s.hist) : s;
    case "toggle-side":
      return { ...s, side: !s.side };
    case "palette":
      return { ...s, palette: a.open };
    case "toggle-palette":
      return { ...s, palette: !s.palette };
    case "open-reading":
      return { ...s, reading: a.text };
    case "close-reading":
      return { ...s, reading: null };
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
