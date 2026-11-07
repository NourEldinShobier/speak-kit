/**
 * Whether this tab's in-page UI is closed. Lives in the content script of one tab only: a page reload creates a fresh script, so it resets by itself.
 * `closedDoc` is the document that was being read when the user closed the UI; late states of that reading must not bring the UI back.
 */
export interface TabUi {
  dismissed: boolean;
  closedDoc?: string | undefined;
}

export type TabUiEvent =
  | { t: "close"; docId?: string | undefined }
  /** the user asked for reading again: shortcut, context menu, popup, extension icon, reader view */
  | { t: "restore" }
  /** a player state for this tab arrived */
  | { t: "state"; active: boolean; docId?: string | undefined };

export const OPEN: TabUi = { dismissed: false };

export function reduceTabUi(s: TabUi, e: TabUiEvent): TabUi {
  switch (e.t) {
    case "close":
      return { dismissed: true, closedDoc: e.docId };
    case "restore":
      return OPEN;
    case "state":
      return s.dismissed && e.active && e.docId !== s.closedDoc ? OPEN : s;
    default: {
      const never: never = e;
      return never;
    }
  }
}
