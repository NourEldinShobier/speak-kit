import { useState } from "react";
import type { Row } from "@speakkit/transcripts/pure";
import { Banner, Button, Chip, EmptyState, Icon, IconButton, Modal, Skeleton } from "@speakkit/ui";
import type { Push, SettingsView } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { dateText, lengthText, removedText } from "./model";
import { useTranscriptList, type ListState } from "./useTranscripts";

function ConfirmDialog({ open, title, count, onClose, onConfirm }: { open: boolean; title: string; count: number; onClose(): void; onConfirm(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={400}
      footer={
        <>
          <Button onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {count === 1 ? "This transcript" : `These ${count} transcripts`} and {count === 1 ? "its" : "their"} audio will be deleted from this computer. You cannot undo it.
      </p>
    </Modal>
  );
}

function TrashRow({ row, onRestore, onDelete }: { row: Row; onRestore(): void; onDelete(): void }) {
  return (
    <div className="tr-row tr-row--trash" data-testid="trash-row" data-row={row.id}>
      <div className="tr-row__main tr-row__main--static">
        <span className="tr-row__icon">
          <Icon name={row.source === "microphone" ? "microphone" : "file-text"} size={16} />
        </span>
        <span className="tr-row__text">
          <span className="tr-row__title">{row.title}</span>
          <span className="tr-row__sub">
            <Chip>{row.source === "file" ? "Imported" : "Recorded"}</Chip>
            <span>
              {lengthText(row.durationSec)}, {dateText(row.createdAt, Date.now())}
            </span>
          </span>
        </span>
        <span className="tr-row__when">
          <span>{removedText(row.daysLeft)}</span>
        </span>
      </div>
      <span className="tr-row__acts tr-row__acts--always">
        <Button size="sm" onClick={onRestore} aria-label={`Restore: ${row.title}`}>
          Restore
        </Button>
        <IconButton name="trash" label={`Delete now: ${row.title}`} size={28} variant="secondary" onClick={onDelete} />
      </span>
    </div>
  );
}

function Loading() {
  return (
    <div className="lm-card tr-loading" aria-busy="true" aria-label="Loading the Trash">
      <div className="tr-row tr-row--skeleton">
        <Skeleton lines={[45, 25]} />
      </div>
    </div>
  );
}

interface BodyProps {
  list: ListState;
  audioDays: number;
  onRestore(r: Row): void;
  onDelete(r: Row): void;
}

/** The deleted transcripts, or the state that stands in for them: error, loading, empty. */
function Body({ list, audioDays, onRestore, onDelete }: BodyProps) {
  if (list.error) {
    return (
      <div className="lm-card">
        <EmptyState icon="alert-triangle" title="The Trash could not be loaded" primary={{ label: "Try again", onClick: list.reload }} />
      </div>
    );
  }
  if (list.rows === null) return <Loading />;
  if (list.rows.length === 0) {
    return (
      <div className="lm-card">
        <EmptyState icon="trash" title="The Trash is empty">
          Transcripts you delete wait here before they are removed for good.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <div className="lm-card tr-list" role="list" aria-label="Deleted transcripts">
        {list.rows.map((r) => (
          <div key={r.id} role="listitem">
            <TrashRow row={r} onRestore={() => onRestore(r)} onDelete={() => onDelete(r)} />
          </div>
        ))}
      </div>
      <Banner tone="info" role="status">
        Restoring puts a transcript back in the list. The audio of a recording is deleted with its transcript and cannot be restored once the {audioDays} days of audio retention have passed. You can
        change both periods in Transcript settings.
      </Banner>
    </>
  );
}

const confirmTitle = (n: number): string => `Delete ${n} ${n === 1 ? "transcript" : "transcripts"} for good`;

/** The Trash: deleted transcripts with the days they have left, Restore and Delete now for each, Empty Trash for all (after a confirmation), and what restoring does. */
export function TrashPage({ push, settings, onBack }: { push: Push; settings: SettingsView | null; onBack(): void }) {
  const list = useTranscriptList("", true, push.tick);
  const [asking, setAsking] = useState<"all" | Row | null>(null);
  const count = list.rows?.length ?? 0;
  const confirm = async () => {
    if (asking === "all") await transcripts.emptyTrash();
    else if (asking) await transcripts.remove(asking.id);
    setAsking(null);
    list.reload();
  };
  return (
    <div className="sk-page tr-page">
      <button type="button" className="tr-back" onClick={onBack}>
        <Icon name="arrow-left" size={12} /> Transcripts
      </button>
      <div className="sk-page__bar">
        <div className="sk-page__head">
          <h1>Trash</h1>
          <p>Deleted transcripts stay here for {settings?.config.trashDays ?? 30} days, then they are removed for good.</p>
        </div>
        <Button variant="danger" disabled={count === 0} onClick={() => setAsking("all")}>
          Empty Trash
        </Button>
      </div>
      <Body list={list} audioDays={settings?.config.audioDays ?? 7} onRestore={(r) => void transcripts.restore(r.id).then(list.reload)} onDelete={setAsking} />
      <ConfirmDialog open={asking !== null} title={confirmTitle(asking === "all" ? count : 1)} count={asking === "all" ? count : 1} onClose={() => setAsking(null)} onConfirm={() => void confirm()} />
    </div>
  );
}
