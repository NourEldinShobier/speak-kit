import type { Voice } from "@speakkit/protocol";
import type { Bookmark, DocMeta } from "../../../shared/library/contract";
import type { ReaderDoc, WordSpan } from "./model";
import type { TextClick } from "./ReaderText";

/** The reading while it loads: loading, gone, or ready with its text. */
export type Load = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; meta: DocMeta; doc: ReaderDoc };

export type Panel = "outline" | null;

export interface FindState {
  open: boolean;
  query: string;
  current: number;
}

/** A click in the text: where it landed and the sentence it belongs to. */
export type Pick = TextClick & { sentence: number };

export interface ReaderUi {
  load: Load;
  voices: Voice[];
  speed: number;
  voiceId: string;
  panel: Panel;
  /** The display card (font, size, spacing) is open. */
  display: boolean;
  find: FindState;
  pick: Pick | null;
  /** The person scrolled away from the sentence being read. */
  away: boolean;
  dismissedFinish: boolean;
  /** Milliseconds until the sleep timer pauses; 0 when it is off. */
  sleepLeft: number;
  word: WordSpan | undefined;
}

export type ReaderAction =
  | { type: "loaded"; meta: DocMeta; doc: ReaderDoc }
  | { type: "refreshed"; meta: DocMeta; doc: ReaderDoc }
  | { type: "missing" }
  | { type: "voices"; voices: Voice[] }
  | { type: "speed"; speed: number }
  | { type: "voice"; voiceId: string }
  | { type: "toggle-panel"; panel: Exclude<Panel, null> }
  | { type: "close-panel" }
  | { type: "toggle-display" }
  | { type: "close-display" }
  | { type: "find-open" }
  | { type: "find-query"; query: string }
  | { type: "find-at"; current: number }
  | { type: "find-close" }
  | { type: "pick"; pick: Pick | null }
  | { type: "away"; away: boolean }
  | { type: "restart" }
  | { type: "sleep"; leftMs: number }
  | { type: "word"; word: WordSpan | undefined }
  | { type: "bookmarks"; bookmarks: Bookmark[] };

export const initReader = (speed: number, voiceId: string): ReaderUi => ({
  load: { kind: "loading" },
  voices: [],
  speed,
  voiceId,
  panel: null,
  display: false,
  find: { open: false, query: "", current: 0 },
  pick: null,
  away: false,
  dismissedFinish: false,
  sleepLeft: 0,
  word: undefined,
});

const sameWord = (a: WordSpan | undefined, b: WordSpan | undefined) => (a && b ? a.start === b.start : a === b);

type Handlers = { [K in ReaderAction["type"]]: (s: ReaderUi, a: Extract<ReaderAction, { type: K }>) => ReaderUi };

const ready = (meta: DocMeta, doc: ReaderDoc): Load => ({ kind: "ready", meta, doc });

const HANDLERS: Handlers = {
  loaded: (s, a) => ({ ...s, load: ready(a.meta, a.doc), voiceId: a.meta.voice ?? s.voiceId }),
  refreshed: (s, a) => ({ ...s, load: ready(a.meta, a.doc) }),
  missing: (s) => ({ ...s, load: { kind: "missing" } }),
  voices: (s, a) => ({ ...s, voices: a.voices }),
  speed: (s, a) => ({ ...s, speed: a.speed }),
  voice: (s, a) => ({ ...s, voiceId: a.voiceId }),
  "toggle-panel": (s, a) => ({ ...s, panel: s.panel === a.panel ? null : a.panel }),
  "close-panel": (s) => ({ ...s, panel: null }),
  "toggle-display": (s) => ({ ...s, display: !s.display }),
  "close-display": (s) => ({ ...s, display: false }),
  "find-open": (s) => ({ ...s, find: { ...s.find, open: true } }),
  "find-query": (s, a) => ({ ...s, find: { open: true, query: a.query, current: 0 } }),
  "find-at": (s, a) => ({ ...s, find: { ...s.find, current: a.current } }),
  "find-close": (s) => ({ ...s, find: { open: false, query: "", current: 0 } }),
  pick: (s, a) => ({ ...s, pick: a.pick }),
  away: (s, a) => ({ ...s, away: a.away }),
  restart: (s) => ({ ...s, dismissedFinish: false, away: false }),
  sleep: (s, a) => ({ ...s, sleepLeft: a.leftMs }),
  word: (s, a) => (sameWord(s.word, a.word) ? s : { ...s, word: a.word }),
  bookmarks: (s, a) => (s.load.kind === "ready" ? { ...s, load: ready({ ...s.load.meta, bookmarks: a.bookmarks }, s.load.doc) } : s),
};

/** Every action has exactly one handler: the table type fails to compile when one is missing. */
export function readerReducer(s: ReaderUi, a: ReaderAction): ReaderUi {
  return (HANDLERS[a.type] as (s: ReaderUi, a: ReaderAction) => ReaderUi)(s, a);
}
