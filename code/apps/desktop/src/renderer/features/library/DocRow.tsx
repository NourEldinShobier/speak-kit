import { Badge, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, Icon, IconButton, ProgressBar } from "@speakkit/ui";
import type { DocMeta, SearchHit } from "../../../shared/library/contract";
import { clock, dayLabel, estimateMs, FORMAT_BADGE, highlightParts, rowStatus, subtitle } from "./model";

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map(([t, hit], i) =>
        hit ? (
          <mark key={i} className="lib-mark">
            {t}
          </mark>
        ) : (
          t
        ),
      )}
    </>
  );
}

interface RowActions {
  onOpen(): void;
  onPlay(): void;
  onRename(): void;
  onVoice(): void;
  onFinished(): void;
  onReveal(): void;
  onDelete(): void;
}

export function DocRow({ doc, speed, now, query, hit, actions }: { doc: DocMeta; speed: number; now: number; query: string; hit?: SearchHit; actions: RowActions }) {
  const status = rowStatus(doc, speed);
  const badge = FORMAT_BADGE[doc.format];
  return (
    <li className="lib-row" data-testid="doc-row">
      <button type="button" className="lib-row__main" onClick={actions.onOpen} aria-label={`Open ${doc.title}`}>
        <span className="lib-row__tile">{badge ? <b>{badge}</b> : <Icon name={doc.source === "url" ? "world" : "clipboard"} size={20} />}</span>
        <span className="lib-row__text">
          <span className="lib-row__title" dir="auto">
            <Marked text={doc.title} query={query} />
          </span>
          <span className="lib-row__sub">{hit?.snippet ? <Marked text={hit.snippet} query={query} /> : <Marked text={subtitle(doc)} query={query} />}</span>
        </span>
        <span className="lib-row__status">
          {status.kind === "progress" ? (
            <>
              <ProgressBar value={status.percent} thin label={`${status.percent}% read`} />
              <span>{status.label}</span>
            </>
          ) : status.kind === "finished" ? (
            <Badge className="lib-badge lib-badge--ok">
              <Icon name="check" size={12} /> Finished
            </Badge>
          ) : (
            <Badge className="lib-badge lib-badge--new">New</Badge>
          )}
        </span>
        <span className="lib-row__len">{doc.needsOcr ? "Scanned" : clock(estimateMs(doc.wordCount, speed))}</span>
        <span className="lib-row__day">{dayLabel(doc.openedAt ?? doc.addedAt, now)}</span>
      </button>
      <DropdownMenu trigger={<IconButton name="dots" label={`More for ${doc.title}`} size={28} />}>
        <DropdownMenuItem icon="player-play" onSelect={actions.onPlay}>
          Play
        </DropdownMenuItem>
        <DropdownMenuItem icon="pencil" onSelect={actions.onRename}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem icon="microphone" onSelect={actions.onVoice}>
          Change voice
        </DropdownMenuItem>
        <DropdownMenuItem icon="circle-check" onSelect={actions.onFinished}>
          {doc.finished ? "Mark as unfinished" : "Mark as finished"}
        </DropdownMenuItem>
        {doc.path ? (
          <DropdownMenuItem icon="folder" onSelect={actions.onReveal}>
            Show in folder
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon="trash" destructive onSelect={actions.onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenu>
    </li>
  );
}
