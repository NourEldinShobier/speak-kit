import { useCallback, useMemo, type Dispatch } from "react";
import type { PlayerCommand, PlayerState } from "@speakkit/protocol";
import type { Bookmark, DocMeta } from "../../../shared/library/contract";
import { api } from "../../ui";
import { library } from "../library";
import { buildDoc, findMatches, outline, toggleBookmark, type ReaderDoc, type ReaderSentence } from "./model";
import type { ReaderRefs } from "./useReaderControl";
import { rangeIn } from "./useHighlights";
import type { ReaderAction, ReaderUi } from "./state";

interface Args {
  meta: DocMeta;
  doc: ReaderDoc;
  ui: ReaderUi;
  st: PlayerState;
  refs: ReaderRefs;
  active: boolean;
  dispatch: Dispatch<ReaderAction>;
  command(c: PlayerCommand): void;
  startAt(index: number): void;
}

/** The bookmarks of the open reading: toggled from the toolbar or the clicked sentence, saved as they change. */
function useBookmarks(meta: DocMeta, doc: ReaderDoc, dispatch: Dispatch<ReaderAction>) {
  const bookmarks: Bookmark[] = meta.bookmarks ?? [];
  const saveBookmarks = (next: Bookmark[]) => {
    dispatch({ type: "bookmarks", bookmarks: next });
    void library.setBookmarks(meta.id, next);
  };
  const bookmarkSentence = (index: number) => {
    const text = doc.sentences[index]?.text;
    if (text) saveBookmarks(toggleBookmark(bookmarks, index, text));
  };
  return { bookmarks, saveBookmarks, bookmarkSentence };
}

/** Scrolling with the reading: back to the current sentence, and the flag that says the person scrolled away. */
function useFollowControls({ sentence, refs, status, dispatch }: { sentence: ReaderSentence | undefined; refs: ReaderRefs; status: PlayerState["status"]; dispatch: Dispatch<ReaderAction> }) {
  const scrollToCurrent = useCallback(() => {
    const sc = refs.scroller.current;
    const root = refs.textRoot.current;
    if (!sc || !root || !sentence) return;
    const rect = rangeIn(root, sentence)?.getBoundingClientRect();
    const box = sc.getBoundingClientRect();
    if (rect) sc.scrollTo({ top: sc.scrollTop + rect.top - box.top - box.height * 0.35, behavior: "smooth" });
  }, [sentence, refs.scroller, refs.textRoot]);
  return {
    scrollToCurrent,
    leaveFollow: () => {
      if (refs.following.current && status === "playing") {
        refs.following.current = false;
        dispatch({ type: "away", away: true });
      }
    },
    followAgain: () => {
      refs.following.current = true;
      dispatch({ type: "away", away: false });
      scrollToCurrent();
    },
  };
}

/** Moving around the text: find, jump to a block or bookmark, read from a clicked sentence, scroll back to the current sentence. */
export function useReaderNav({ meta, doc, ui, st, refs, active, dispatch, command, startAt }: Args) {
  const sentence = active ? doc.sentences[st.sentenceIndex] : undefined;
  const matches = useMemo(() => (ui.find.open ? findMatches(doc.blocks, ui.find.query) : []), [doc, ui.find.open, ui.find.query]);
  const outlineItems = useMemo(() => outline(doc.blocks, meta.format === "pdf"), [doc, meta.format]);
  const marks = useBookmarks(meta, doc, dispatch);

  const follow = useFollowControls({ sentence, refs, status: st.status, dispatch });

  const goTo = (block: number, index: number) => {
    refs.textRoot.current?.querySelector(`[data-block="${block}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (active && index >= 0) {
      refs.following.current = true;
      command({ cmd: "seek-sentence", index });
    }
  };
  return {
    sentence,
    matches,
    outlineItems,
    ...marks,
    ...follow,
    goTo,
    jumpTo: (block: number) => goTo(block, doc.firstSentence[block] ?? -1),
    goToBookmark: (index: number) => doc.sentences[index] && goTo(doc.sentences[index].block, index),
    stepFind: (dir: 1 | -1) => {
      if (!matches.length) return;
      const current = (ui.find.current + dir + matches.length) % matches.length;
      dispatch({ type: "find-at", current });
      refs.textRoot.current?.querySelector(`[data-block="${matches[current]!.block}"]`)?.scrollIntoView({ block: "center" });
    },
    readFrom: (index: number) => {
      dispatch({ type: "pick", pick: null });
      if (active) command({ cmd: "seek-sentence", index });
      else startAt(index);
    },
    copySentence: (index: number) => {
      void api.copy(doc.sentences[index]?.text ?? "");
      dispatch({ type: "pick", pick: null });
    },
    /** After text recognition added text: load the reading again. */
    reload: () =>
      library.get(meta.id).then((d) => {
        if (!d) return;
        const { blocks, ...m } = d;
        dispatch({ type: "refreshed", meta: m, doc: buildDoc(blocks) });
      }),
  };
}
