import { useReducer } from "react";
import type { PlayerCommand, PlayerState } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";
import type { AppState } from "../../../shared/ipc";
import { estimateMs } from "../library";
import { DisplayCard } from "./DisplayPopover";
import { FinishedCard, FindBar, OutlinePanel } from "./Panels";
import { PlayerBar } from "./PlayerBar";
import { BackToCurrent, PickChip, PreparingNote, ReaderArticle, ReaderLoading, ReaderMissing, ReaderTop } from "./ReaderParts";
import { FONT_STACK, useDisplay, type Display } from "./display";
import type { ReaderDoc } from "./model";
import { initReader, readerReducer, type ReaderAction, type ReaderUi } from "./state";
import { useHighlights } from "./useHighlights";
import { useReaderPlayer } from "./usePlayer";
import { useFollowScroll, useProgressSaving, useReaderKeys, useReaderLoad, useSleepTimer, useWordTick } from "./useReaderEffects";
import { sentenceClockHandler, useReaderControl, useReaderRefs } from "./useReaderControl";
import { useReaderNav } from "./useReaderNav";
import { useToolbar, type FooterId } from "./toolbar";
import "./reader.css";
import "./player.css";

interface ReaderProps {
  s: AppState;
  id: string;
  autoplay: boolean;
  onBack(): void;
  /** Opens the export dialog with the whole text of this reading. */
  onExport(text: string, name: string): void;
}

interface ReadyProps extends ReaderProps {
  meta: DocMeta;
  doc: ReaderDoc;
  ui: ReaderUi;
  dispatch(a: ReaderAction): void;
}

export function Reader(props: ReaderProps) {
  const [ui, dispatch] = useReducer(readerReducer, undefined, () => initReader(props.s.config.speed, props.s.config.voice));
  useReaderLoad(props.id, dispatch);
  if (ui.load.kind === "missing") return <ReaderMissing onBack={props.onBack} />;
  if (ui.load.kind === "loading") return <ReaderLoading />;
  return <ReaderReady {...props} meta={ui.load.meta} doc={ui.load.doc} ui={ui} dispatch={dispatch} />;
}

function ReaderReady({ s, id, autoplay, onBack, onExport, meta, doc, ui, dispatch }: ReadyProps) {
  const [display, setDisplay] = useDisplay();
  const refs = useReaderRefs();
  const [toolbar, setToolbar] = useToolbar();
  const { state: st, play, command, volume, setVolume } = useReaderPlayer(sentenceClockHandler(refs.clock));
  const ctl = useReaderControl({ s, autoplay, meta, doc, ui, st, refs, dispatch, play, command });
  const nav = useReaderNav({ meta, doc, ui, st, refs, active: ctl.active, dispatch, command, startAt: ctl.startAt });

  useProgressSaving({ id, doc, st, saver: refs.saver });
  useHighlights(refs.textRoot, { sentence: nav.sentence, word: ui.word, matches: nav.matches, current: ui.find.current });
  useWordTick({ status: st.status, sentence: nav.sentence, clock: refs.clock, dispatch });
  useFollowScroll({ sentence: nav.sentence, follow: display.follow, following: refs.following, scroller: refs.scroller, textRoot: refs.textRoot, scrollToCurrent: nav.scrollToCurrent });
  useSleepTimer({ sleepLeft: ui.sleepLeft, sleep: refs.sleep, command, dispatch });
  useReaderKeys({ active: ctl.active, findOpen: ui.find.open, toggle: ctl.toggle, command, dispatch });

  const style = { "--rd-size": `${display.size}px`, "--rd-line": display.line, "--rd-width": `${display.width}px`, "--rd-font": FONT_STACK[display.font] } as React.CSSProperties;
  return (
    <div className="rd" style={style} data-testid="reader" data-status={st.status}>
      <ReaderTop
        meta={meta}
        panel={ui.panel}
        displayOpen={ui.display}
        hidden={toolbar.header}
        bookmarked={nav.bookmarks.some((b) => b.sentence === ctl.here)}
        blocked={ctl.blocked}
        dispatch={dispatch}
        onBack={onBack}
        onBookmark={() => nav.bookmarkSentence(ctl.here)}
        onExport={() => onExport(doc.blocks.map((b) => b.text).join("\n\n"), meta.title)}
        onShown={(id, shown) => setToolbar({ bar: "header", id, shown })}
      />
      <ReaderMain props={{ s, meta, doc, ui, st, ctl, nav, refs, dispatch, onBack, display, setDisplay }} />
      <ReaderBar props={{ meta, ui, st, ctl, command, dispatch, volume, setVolume, hidden: toolbar.footer, onShown: (id, shown) => setToolbar({ bar: "footer", id, shown }) }} />
    </div>
  );
}

interface BarProps {
  props: Pick<ReadyProps, "meta" | "ui" | "dispatch"> & {
    st: PlayerState;
    ctl: ReturnType<typeof useReaderControl>;
    command(c: PlayerCommand): void;
    volume: number;
    setVolume(v: number): void;
    hidden: readonly FooterId[];
    onShown(id: FooterId, shown: boolean): void;
  };
}

/** The bottom player bar wired to the controls. */
function ReaderBar({ props: { meta, ui, st, ctl, command, dispatch, volume, setVolume, hidden, onShown } }: BarProps) {
  return (
    <PlayerBar
      state={st}
      estimatedTotalMs={estimateMs(meta.wordCount, ui.speed)}
      speed={ui.speed}
      voices={ui.voices}
      voiceId={ui.voiceId}
      sleepLeftMs={ui.sleepLeft}
      disabled={ctl.blocked}
      panel={ui.panel}
      volume={volume}
      hidden={hidden}
      onToggle={ctl.toggle}
      onSkip={(d) => ctl.active && command({ cmd: "seek-ms", deltaMs: d })}
      onBlock={(d) => (ctl.active ? command({ cmd: d === 1 ? "next-block" : "prev-block" }) : ctl.toggle())}
      onSeek={ctl.seekFraction}
      onSpeed={ctl.changeSpeed}
      onVoice={ctl.changeVoice}
      onSleep={ctl.changeSleep}
      onOutline={() => dispatch({ type: "toggle-panel", panel: "outline" })}
      onVolume={setVolume}
      onShown={onShown}
    />
  );
}

interface MainProps {
  props: Pick<ReadyProps, "s" | "meta" | "doc" | "ui" | "dispatch" | "onBack"> & {
    st: ReturnType<typeof useReaderPlayer>["state"];
    ctl: ReturnType<typeof useReaderControl>;
    nav: ReturnType<typeof useReaderNav>;
    refs: ReturnType<typeof useReaderRefs>;
    display: Display;
    setDisplay(patch: Partial<Display>): void;
  };
}

/** The scrolling text with the cards that float over it (find, display), the outline panel and the finished card. */
function ReaderMain({ props: { meta, doc, ui, st, ctl, nav, refs, dispatch, onBack, display, setDisplay } }: MainProps) {
  const { pick } = ui;
  const bookmarkPick = (sentence: number) => {
    nav.bookmarkSentence(sentence);
    dispatch({ type: "pick", pick: null });
  };
  return (
    <div className="rd-main">
      <div className="rd-pane">
        <div className="rd-scroll" ref={refs.scroller} onWheel={nav.leaveFollow} onPointerDown={nav.leaveFollow} data-testid="reader-scroll">
          <ReaderArticle meta={meta} doc={doc} error={st.error} textRef={refs.textRoot} dispatch={dispatch} onRetry={ctl.toggle} onOcrDone={() => void nav.reload()} />
          {pick && <PickChip pick={pick} onRead={() => nav.readFrom(pick.sentence)} onBookmark={() => bookmarkPick(pick.sentence)} onCopy={() => nav.copySentence(pick.sentence)} />}
        </div>
        {ui.find.open && (
          <FindBar
            query={ui.find.query}
            count={nav.matches.length}
            current={ui.find.current}
            onQuery={(query) => dispatch({ type: "find-query", query })}
            onStep={nav.stepFind}
            onClose={() => {
              dispatch({ type: "find-close" });
              document.querySelector<HTMLElement>("[data-find-trigger]")?.focus(); // opened from this header button
            }}
          />
        )}
        {ui.display && <DisplayCard d={display} onChange={setDisplay} onClose={() => dispatch({ type: "close-display" })} />}
      </div>
      {ui.panel === "outline" && (
        <OutlinePanel
          items={nav.outlineItems}
          bookmarks={nav.bookmarks}
          current={nav.sentence?.block ?? 0}
          onPick={nav.jumpTo}
          onPickBookmark={nav.goToBookmark}
          onRemoveBookmark={(i) => nav.saveBookmarks(nav.bookmarks.filter((b) => b.sentence !== i))}
          onClose={() => dispatch({ type: "close-panel" })}
        />
      )}
      {ui.away && st.status === "playing" && <BackToCurrent onClick={nav.followAgain} />}
      {st.status === "preparing" && st.elapsedMs > 0 && <PreparingNote />}
      {st.status === "finished" && !ui.dismissedFinish && <FinishedCard title={meta.title} onBack={onBack} onReplay={() => ctl.startAt(0)} />}
    </div>
  );
}
