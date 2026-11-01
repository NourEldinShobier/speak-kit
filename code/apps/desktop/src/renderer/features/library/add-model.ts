/** The words in a pasted text. */
export const countWords = (t: string): number => t.match(/\S+/g)?.length ?? 0;

export interface PasteState {
  text: string;
  title: string;
  voice: string;
  error: string | null;
}

export type PasteAction = { type: "text"; text: string } | { type: "title"; title: string } | { type: "voice"; voice: string } | { type: "failed"; message: string } | { type: "added" };

export const initPaste = (voice: string): PasteState => ({ text: "", title: "", voice, error: null });

export function pasteReducer(s: PasteState, a: PasteAction): PasteState {
  switch (a.type) {
    case "text":
      return { ...s, text: a.text };
    case "title":
      return { ...s, title: a.title };
    case "voice":
      return { ...s, voice: a.voice };
    case "failed":
      return { ...s, error: a.message };
    case "added":
      return { ...s, text: "", title: "", error: null };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

export type FetchPhase = { kind: "idle" } | { kind: "fetching" } | { kind: "failed"; message: string };

export interface UrlState {
  url: string;
  phase: FetchPhase;
  /** The technical reason is expanded. */
  details: boolean;
}

export type UrlAction = { type: "url"; url: string } | { type: "fetch" } | { type: "failed"; message: string } | { type: "added" } | { type: "toggle-details" };

export const initUrl = (): UrlState => ({ url: "", phase: { kind: "idle" }, details: false });

export function urlReducer(s: UrlState, a: UrlAction): UrlState {
  switch (a.type) {
    case "url":
      return { ...s, url: a.url };
    case "fetch":
      return { ...s, phase: { kind: "fetching" } };
    case "failed":
      return { ...s, phase: { kind: "failed", message: a.message } };
    case "added":
      return { ...s, url: "", phase: { kind: "idle" } };
    case "toggle-details":
      return { ...s, details: !s.details };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}
