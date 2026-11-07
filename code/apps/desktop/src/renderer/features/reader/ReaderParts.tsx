import { Fragment, type Dispatch, type ReactElement } from "react";
import { Banner, Button, IconButton, Spinner } from "@speakkit/ui";
import type { PlayerState } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";
import { CustomiseToolbar } from "./CustomiseToolbar";
import { OcrPanel } from "./OcrPanel";
import { ReaderText } from "./ReaderText";
import { sentenceAt, type ReaderDoc } from "./model";
import type { Panel, Pick, ReaderAction } from "./state";
import { HEADER_IDS, type HeaderId } from "./toolbar";

type Send = Dispatch<ReaderAction>;

const SOURCE_LABEL = { paste: "Pasted text", file: "File", url: "Web page" } as const;

export function ReaderMissing({ onBack }: { onBack(): void }) {
  return (
    <div className="rd rd--empty">
      <Banner
        tone="warning"
        title="This reading is gone"
        action={
          <Button size="sm" onClick={onBack}>
            Back to library
          </Button>
        }
      >
        It was deleted from the library.
      </Banner>
    </div>
  );
}

export function ReaderLoading() {
  return (
    <div className="rd rd--empty">
      <Spinner size={20} />
    </div>
  );
}

interface TopProps {
  meta: DocMeta;
  panel: Panel;
  displayOpen: boolean;
  bookmarked: boolean;
  blocked: boolean;
  /** Header items the person turned off. */
  hidden: readonly HeaderId[];
  dispatch: Send;
  onBack(): void;
  onBookmark(): void;
  onExport(): void;
  onShown(id: HeaderId, shown: boolean): void;
}

/** Back link and source, then the five reading icons (find, display, bookmark, export, outline) and the "…" button that customises them. */
export function ReaderTop({ meta, panel, displayOpen, bookmarked, blocked, hidden, dispatch, onBack, onBookmark, onExport, onShown }: TopProps) {
  const icons: Record<HeaderId, ReactElement> = {
    search: <IconButton name="search" label="Find in text" onClick={() => dispatch({ type: "find-open" })} />,
    display: (
      <IconButton
        name="text-size"
        label="Display settings"
        aria-expanded={displayOpen}
        aria-haspopup="dialog"
        data-display-trigger=""
        onClick={() => dispatch({ type: "toggle-display" })}
      />
    ),
    bookmark: <IconButton name="bookmark" label="Bookmark this place" aria-pressed={bookmarked} disabled={blocked} onClick={onBookmark} />,
    export: <IconButton name="download" label="Export audio" disabled={blocked} onClick={onExport} />,
    outline: <IconButton name="layout-sidebar-right" label="Outline" aria-pressed={panel === "outline"} onClick={() => dispatch({ type: "toggle-panel", panel: "outline" })} />,
  };
  return (
    <header className="rd-top">
      <IconButton name="arrow-left" label="Back to library" onClick={onBack} />
      <button type="button" className="rd-crumb" onClick={onBack}>
        Library
      </button>
      <span className="rd-source">
        {SOURCE_LABEL[meta.source]} · {meta.origin}
      </span>
      <span className="rd-spacer" />
      <div className="rd-top__icons">
        {HEADER_IDS.filter((id) => !hidden.includes(id)).map((id) => (
          <Fragment key={id}>{icons[id]}</Fragment>
        ))}
      </div>
      <CustomiseToolbar label="Customise header toolbar" ids={HEADER_IDS} hidden={hidden} side="bottom" onShown={onShown} />
    </header>
  );
}

interface ArticleProps {
  meta: DocMeta;
  doc: ReaderDoc;
  error: PlayerState["error"];
  textRef: React.RefObject<HTMLDivElement | null>;
  dispatch: Send;
  onRetry(): void;
  onOcrDone(): void;
}

/** The title, the text recognition offer, the playback error and the text itself. */
export function ReaderArticle({ meta, doc, error, textRef, dispatch, onRetry, onOcrDone }: ArticleProps) {
  return (
    <article className="rd-article" ref={textRef}>
      <h1 className="rd-title" dir="auto">
        {meta.title}
      </h1>
      <p className="rd-meta">
        {meta.wordCount.toLocaleString()} words{meta.pages ? ` · ${meta.pages} pages` : ""}
      </p>
      {meta.needsOcr && <OcrPanel id={meta.id} pages={meta.pages ?? 0} onDone={onOcrDone} />}
      {error && (
        <Banner
          tone="error"
          title="Reading stopped"
          action={
            <Button size="sm" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {error.message}
        </Banner>
      )}
      <ReaderText blocks={doc.blocks} onPick={(c) => dispatch({ type: "pick", pick: { ...c, sentence: sentenceAt(doc, c.block, c.offset) } })} />
    </article>
  );
}

/** The small toolbar next to a clicked sentence. */
export function PickChip({ pick, onRead, onBookmark, onCopy }: { pick: Pick; onRead(): void; onBookmark(): void; onCopy(): void }) {
  return (
    <div className="rd-chip" style={{ left: pick.x, top: pick.y - 44 }} role="toolbar">
      <Button size="sm" variant="primary" iconLeft="player-play" onClick={onRead}>
        Read from here
      </Button>
      <Button size="sm" iconLeft="bookmark" onClick={onBookmark}>
        Bookmark
      </Button>
      <Button size="sm" iconLeft="copy" onClick={onCopy}>
        Copy
      </Button>
    </div>
  );
}

export function BackToCurrent({ onClick }: { onClick(): void }) {
  return (
    <Button variant="primary" size="sm" iconLeft="arrow-down" className="rd-back" onClick={onClick}>
      Back to current
    </Button>
  );
}

export function PreparingNote() {
  return (
    <div className="rd-prepare" role="status">
      <Spinner size={14} /> Preparing next paragraph
    </div>
  );
}
