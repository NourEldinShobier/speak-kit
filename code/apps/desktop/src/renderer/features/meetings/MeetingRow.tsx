import type { Row } from "@speakkit/meetings/pure";
import { Button, Chip, IconButton } from "@speakkit/ui";
import type { RecordingView } from "../../../shared/meetings/contract";
import { Marked } from "./Marked";
import { ProviderMark } from "./ProviderMark";
import { subtitle, timeText, timerText } from "./model";

interface Props {
  row: Row;
  now: number;
  /** The recording, when this row is the one running. */
  live: RecordingView | null;
  query: string;
  trashed: boolean;
  onOpen(): void;
  onDelete(): void;
  onRetry(): void;
  onRestore(): void;
}

/** What the right side of a row says: the running timer, that notes are being written, or when it was and when its audio goes. */
function Right({ row, live }: { row: Row; live: RecordingView | null }) {
  if (live) {
    return (
      <span className="mt-row__live" role="timer" aria-label={`Recording, ${timerText(live.seconds)}`}>
        <span className="mt-row__dot" aria-hidden="true" />
        {timerText(live.seconds)}
      </span>
    );
  }
  return (
    <span className="tr-row__when">
      {row.notes.state === "writing" ? <Chip>Writing notes</Chip> : null}
      <span>{timeText(row.startedAt)}</span>
      {row.audio ? <span className="tr-row__removed">{row.audio}</span> : null}
    </span>
  );
}

function Stopped({ row, onRetry, onDelete }: Pick<Props, "row" | "onRetry" | "onDelete">) {
  const failed = row.status === "failed";
  return (
    <div className="tr-row__state" data-state={row.status}>
      <span className={failed ? "tr-row__error" : "tr-row__label"} role={failed ? "alert" : undefined}>
        {row.failure?.message ?? (failed ? "The meeting could not be finished." : "Interrupted before it finished.")}
      </span>
      <span className="tr-row__btns">
        {row.audioBytes > 0 ? (
          <Button size="sm" onClick={onRetry} aria-label={`Try again: ${row.title}`}>
            Try again
          </Button>
        ) : null}
        <Button size="sm" variant="danger" onClick={onDelete} aria-label={`Delete: ${row.title}`}>
          Delete
        </Button>
      </span>
    </div>
  );
}

/** One meeting in the list: the app's mark, the title, how long and how many chapters, when it was and when its audio goes. A meeting that is not finished says why, and failed ones can be deleted. */
export function MeetingRow({ row, live, query, trashed, onOpen, onDelete, onRetry, onRestore }: Props) {
  const stopped = row.status === "failed" || row.status === "interrupted";
  const running = row.status === "recording" || row.status === "saving";
  return (
    <div className="tr-row mt-row" data-testid="meeting-row" data-row={row.id} data-status={row.status}>
      <button type="button" className="tr-row__main" onClick={onOpen} disabled={running} aria-label={`Open: ${row.title}`}>
        <span className="tr-row__icon mt-mark" aria-hidden="true">
          <ProviderMark providerId={row.providerId} name={row.providerName} />
        </span>
        <span className="tr-row__text">
          <span className="tr-row__title">{row.title}</span>
          <span className="tr-row__sub">{subtitle(row, !!live)}</span>
          {row.snippet ? (
            <span className="tr-row__snippet">
              <Marked text={row.snippet} query={query} />
            </span>
          ) : null}
        </span>
        <Right row={row} live={live} />
      </button>
      {stopped ? <Stopped row={row} onRetry={onRetry} onDelete={onDelete} /> : null}
      {!stopped && !running && !trashed ? (
        <span className="tr-row__acts">
          <IconButton name="trash" label={`Delete: ${row.title}`} size={28} variant="secondary" onClick={onDelete} />
        </span>
      ) : null}
      {trashed ? (
        <span className="tr-row__acts">
          <Button size="sm" onClick={onRestore} aria-label={`Restore: ${row.title}`}>
            Restore
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete} aria-label={`Delete now: ${row.title}`}>
            Delete now
          </Button>
        </span>
      ) : null}
    </div>
  );
}
