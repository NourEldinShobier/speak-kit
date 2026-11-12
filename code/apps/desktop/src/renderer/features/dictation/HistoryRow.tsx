import { Icon } from "@speakkit/ui";
import type { HistoryItem } from "../../../shared/dictation/contract";
import { appName, clockText, entryLabel, expiryText, markChanges, rewriteTag, timeText } from "./model";

export type View = "final" | "side";

function Marked({ words }: { words: { text: string; changed: boolean }[] }) {
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          {w.changed ? <mark className="dict-hist__mark">{w.text}</mark> : w.text}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function RowMeta({ item, deadlineMs }: { item: HistoryItem; deadlineMs: number }) {
  const tag = rewriteTag(item.rewrite, deadlineMs);
  return (
    <div className="dict-hist__body">
      <p className="dict-hist__text">{item.text}</p>
      <p className="dict-hist__meta">
        <span>{expiryText(item.expiresInMs)}</span>
        {item.recording ? <span>Recording kept</span> : null}
        {item.recordingRemoved ? <span>Recording removed to stay under the limit</span> : null}
        {tag ? <span className="dict-hist__tag">{tag}</span> : null}
        {item.via ? (
          <span className="dict-hist__tag">
            Matched &ldquo;{item.via.heard}&rdquo; from your Vocabulary entry {item.via.word}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function RowWhen({ item, label, open, onToggle }: { item: HistoryItem; label: string; open: boolean | undefined; onToggle: (() => void) | undefined }) {
  return (
    <div className="dict-hist__when">
      <span>{timeText(item.at)}</span>
      <span className="dict-hist__app">{appName(item.app)}</span>
      {item.recording && onToggle ? (
        <button type="button" className="dict-hist__rec" aria-expanded={open} aria-label={`Recording of: ${label}`} onClick={onToggle}>
          <Icon name="player-play" size={10} /> {clockText(item.durationMs)}
          <Icon name={open ? "chevron-up" : "chevron-down"} size={10} />
        </button>
      ) : null}
    </div>
  );
}

function RowActions({ label, copied, onCopy, onDelete }: { label: string; copied: boolean; onCopy: () => void; onDelete: () => void }) {
  return (
    <div className="dict-hist__acts" data-copied={copied || undefined}>
      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Copy: ${label}`} onClick={onCopy}>
        <Icon name={copied ? "check" : "copy"} size={14} />
      </button>
      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Delete: ${label}`} onClick={onDelete}>
        <Icon name="trash" size={14} />
      </button>
      <span className="dict-hist__sr" role="status">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}

/** One entry. Both buttons stay in place after a copy (focus stays on the button); the live region announces it. Names carry the entry's words. */
export function HistoryRow({
  item,
  copied,
  onCopy,
  onDelete,
  view = "final",
  open,
  onToggle,
  rewriteDeadlineMs = 4000,
}: {
  item: HistoryItem;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
  view?: View;
  open?: boolean;
  onToggle?: () => void;
  rewriteDeadlineMs?: number;
}) {
  const label = entryLabel(item.text);
  const marks = view === "side" ? markChanges(item.raw, item.text) : undefined;
  return (
    <div className={`lm-row dict-hist__row${view === "side" ? " dict-hist__row--side" : ""}`} data-testid="history-row" data-row={item.id}>
      <RowWhen item={item} label={label} open={open} onToggle={onToggle} />
      {marks ? (
        <>
          <p className="dict-hist__text dict-hist__text--raw">
            <Marked words={marks.heard} />
          </p>
          <p className="dict-hist__text">
            <Marked words={marks.pasted} />
          </p>
        </>
      ) : (
        <RowMeta item={item} deadlineMs={rewriteDeadlineMs} />
      )}
      <RowActions label={label} copied={copied} onCopy={onCopy} onDelete={onDelete} />
    </div>
  );
}
