import type { Row } from "@speakkit/transcripts/pure";
import { Button, Chip, Icon, IconButton, ProgressBar } from "@speakkit/ui";
import { ExportMenu, type ExportResult } from "./ExportMenu";
import { Marked } from "./Marked";
import { audioText, dateText, lengthText, progressOf, removedText } from "./model";

/** Days of audio left, from the transcript's own days left and the audio setting: the audio never outlives the text. */
export const audioDaysLeft = (r: Row, audioDays: number | null, now = Date.now()): number | null => {
  if (audioDays === null) return r.daysLeft;
  const created = Math.max(0, audioDays - Math.floor((now - r.createdAt) / 86_400_000));
  return r.daysLeft === null ? created : Math.min(created, r.daysLeft);
};

interface RowProps {
  row: Row;
  now: number;
  audioDays: number;
  /** The words typed in the search, to mark in the snippet. */
  query?: string;
  onOpen(): void;
  onDelete(): void;
  onCancel(): void;
  onResume(): void;
  onExport(r: ExportResult): void;
}

type Kind = "done" | "live" | "stopped";

const kindOf = (r: Row): Kind => {
  if (r.status === "done") return "done";
  if (r.status === "queued" || r.status === "transcribing" || r.status === "recording") return "live";
  return "stopped";
};

function Meta({ row, audioDays, now }: { row: Row; audioDays: number; now: number }) {
  const sub = row.source === "file" ? (row.sourceName ?? "") : audioText(row, audioDaysLeft(row, audioDays, now));
  return (
    <span className="tr-row__sub">
      <Chip>{row.source === "file" ? "Imported" : "Recorded"}</Chip>
      {row.recovered ? <Chip>Recovered</Chip> : null}
      {sub ? <span>{sub}</span> : null}
    </span>
  );
}

function Running({ row, onCancel }: { row: Row; onCancel(): void }) {
  const p = progressOf(row)!;
  return (
    <div className="tr-row__state" data-state={row.status}>
      <div className="tr-row__bar">
        <ProgressBar block thin {...(p.fraction !== null && { value: Math.round(p.fraction * 100) })} label={`${row.title}: ${p.label}`} />
        <span className="tr-row__label">{p.label}</span>
      </div>
      <Button size="sm" onClick={onCancel} aria-label={`Cancel: ${row.title}`}>
        Cancel
      </Button>
    </div>
  );
}

const stoppedText = (r: Row): string => {
  if (r.status === "failed") return r.failure?.message ?? "Transcription failed.";
  return r.status === "cancelled" ? "Stopped before it finished." : "Interrupted before it finished.";
};

function Stopped({ row, onResume, onDelete }: { row: Row; onResume(): void; onDelete(): void }) {
  const failed = row.status === "failed";
  return (
    <div className="tr-row__state" data-state={row.status}>
      <span className={failed ? "tr-row__error" : "tr-row__label"} role={failed ? "alert" : undefined}>
        {stoppedText(row)}
      </span>
      <span className="tr-row__btns">
        {row.audioBytes > 0 || row.chunksDone > 0 ? (
          <Button size="sm" onClick={onResume} aria-label={`${failed ? "Try again" : "Resume"}: ${row.title}`}>
            {failed ? "Try again" : "Resume"}
          </Button>
        ) : null}
        <Button size="sm" variant="danger" onClick={onDelete} aria-label={`Delete: ${row.title}`}>
          Delete
        </Button>
      </span>
    </div>
  );
}

function Details({ row, now }: { row: Row; now: number }) {
  return (
    <>
      {row.status === "done" ? <span className="tr-row__len">{lengthText(row.durationSec)}</span> : null}
      <span className="tr-row__when">
        <span>{dateText(row.createdAt, now)}</span>
        {row.status === "done" ? <span className="tr-row__removed">{removedText(row.daysLeft)}</span> : null}
      </span>
    </>
  );
}

function Actions({ row, onOpen, onDelete, onExport }: Pick<RowProps, "row" | "onOpen" | "onDelete" | "onExport">) {
  return (
    <span className="tr-row__acts">
      <Button size="sm" onClick={onOpen} aria-label={`Open transcript: ${row.title}`}>
        Open
      </Button>
      <ExportMenu
        id={row.id}
        onResult={onExport}
        trigger={
          <Button size="sm" iconLeft="download" aria-label={`Export: ${row.title}`}>
            Export
          </Button>
        }
      />
      <IconButton name="trash" label={`Delete: ${row.title}`} size={28} variant="secondary" onClick={onDelete} />
    </span>
  );
}

/** One transcript in the list: title, kind, length, date and how long it stays; Open, Export and Delete appear on hover or focus. A job that is not finished shows its progress, or why it stopped. */
export function TranscriptRow({ row, now, audioDays, query = "", onOpen, onDelete, onCancel, onResume, onExport }: RowProps) {
  const kind = kindOf(row);
  return (
    <div className="tr-row" data-testid="transcript-row" data-row={row.id} data-status={row.status}>
      <button type="button" className="tr-row__main" onClick={onOpen} disabled={kind === "live"} aria-label={`Open: ${row.title}`}>
        <span className="tr-row__icon">
          <Icon name={row.source === "microphone" ? "microphone" : "file-text"} size={16} />
        </span>
        <span className="tr-row__text">
          <span className="tr-row__title">{row.title}</span>
          <Meta row={row} audioDays={audioDays} now={now} />
          {row.snippet ? (
            <span className="tr-row__snippet">
              <Marked text={row.snippet} query={query} />
            </span>
          ) : null}
        </span>
        <Details row={row} now={now} />
      </button>
      {kind === "done" ? <Actions row={row} onOpen={onOpen} onDelete={onDelete} onExport={onExport} /> : null}
      {kind === "live" ? <Running row={row} onCancel={onCancel} /> : null}
      {kind === "stopped" ? <Stopped row={row} onResume={onResume} onDelete={onDelete} /> : null}
    </div>
  );
}
