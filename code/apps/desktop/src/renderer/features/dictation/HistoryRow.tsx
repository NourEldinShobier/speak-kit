import { Checkbox, Icon } from "@speakkit/ui";
import type { HistoryItem } from "../../../shared/dictation/contract";
import { clockText, correctedTag, entryLabel, expiryText, rewriteTag, rowApp, rowTags, timeText, timingTags } from "./model";

function RowMeta({ item }: { item: HistoryItem }) {
  const tag = rewriteTag(item.rewrite);
  return (
    <div className="dict-hist__body">
      <p className="dict-hist__text">{item.text}</p>
      <p className="dict-hist__meta">
        <span>{expiryText(item.expiresInMs)}</span>
        {item.recording ? <span>Recording kept</span> : null}
        {item.recordingRemoved ? <span>Recording removed to stay under the limit</span> : null}
        {tag ? <span className="dict-hist__tag">{tag}</span> : null}
        {item.corrected?.length ? <span className="dict-hist__tag">{correctedTag(item.corrected)}</span> : null}
        {[...rowTags(item), ...timingTags(item)].map((t) => (
          <span key={t} className="dict-hist__tag">
            {t}
          </span>
        ))}
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
      <span className="dict-hist__app">{rowApp(item)}</span>
      {item.model ? (
        <span className="dict-hist__app" data-testid="history-model">
          {[item.model, item.language].filter(Boolean).join(", ")}
        </span>
      ) : null}
      {item.recording && onToggle ? (
        <button type="button" className="dict-hist__rec" aria-expanded={open} aria-label={`Recording of: ${label}`} onClick={onToggle}>
          <Icon name="player-play" size={10} /> {clockText(item.durationMs)}
          <Icon name={open ? "chevron-up" : "chevron-down"} size={10} />
        </button>
      ) : null}
    </div>
  );
}

function RowActions({ label, copied, onCopy, onFix, onDelete }: { label: string; copied: boolean; onCopy: () => void; onFix: () => void; onDelete: () => void }) {
  return (
    <div className="dict-hist__acts" data-copied={copied || undefined}>
      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Copy: ${label}`} onClick={onCopy}>
        <Icon name={copied ? "check" : "copy"} size={14} />
      </button>
      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Fix: ${label}`} onClick={onFix}>
        <Icon name="pencil" size={14} />
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
  onFix,
  onDelete,
  open,
  onToggle,
  selection,
}: {
  item: HistoryItem;
  copied: boolean;
  onCopy: () => void;
  /** Opens the editor that turns the person's fixes into corrections. */
  onFix: () => void;
  onDelete: () => void;
  open?: boolean;
  onToggle?: () => void;
  /** Selection mode: whether the entry is ticked and how to tick it. */
  selection?: { checked: boolean; toggle: () => void };
}) {
  const label = entryLabel(item.text);
  return (
    <div className="lm-row dict-hist__row" data-testid="history-row" data-row={item.id}>
      {selection && <Checkbox aria-label={`Select: ${label}`} checked={selection.checked} onChange={selection.toggle} />}
      <RowWhen item={item} label={label} open={open} onToggle={onToggle} />
      <RowMeta item={item} />
      <RowActions label={label} copied={copied} onCopy={onCopy} onFix={onFix} onDelete={onDelete} />
    </div>
  );
}
