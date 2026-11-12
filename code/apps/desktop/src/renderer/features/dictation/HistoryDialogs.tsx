import { useEffect, useState } from "react";
import { Button, Modal } from "@speakkit/ui";
import type { HistoryStats } from "@speakkit/dictation";
import { dictation } from "./api";
import { appName, statsRows } from "./model";

export function ClearDialog({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Clear all dictation history?"
      width={400}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>
            Clear history
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        This deletes {count} {count === 1 ? "entry" : "entries"} from this computer. It does not change text already typed into other apps. You cannot undo it.
      </p>
    </Modal>
  );
}

/** Totals over the whole history, with how each text ended up. */
export function StatsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<HistoryStats | "failed" | null>(null);
  useEffect(() => {
    if (!open) return;
    setStats(null);
    dictation.historyStats().then(setStats, () => setStats("failed"));
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Dictation statistics" width={400}>
      {stats === null && <p className="sk-modal-text">Counting…</p>}
      {stats === "failed" && <p className="sk-modal-text">The statistics could not be read. Close this and try again.</p>}
      {stats && stats !== "failed" && (
        <>
          <dl className="dict-stats">
            {statsRows(stats).map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
          {stats.topApps.length > 0 && <p className="sk-modal-text dict-stats__apps">{`Most used: ${stats.topApps.map((a) => `${appName(a.app)} (${a.count})`).join(", ")}`}</p>}
        </>
      )}
    </Modal>
  );
}

export function DeleteSelectedDialog({ count, onClose, onConfirm }: { count: number; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      open={count > 0}
      onClose={onClose}
      title={`Delete ${count} ${count === 1 ? "entry" : "entries"}?`}
      width={400}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        This deletes the selected entries from this computer. It does not change text already typed into other apps. You cannot undo it.
      </p>
    </Modal>
  );
}

export type HistoryDialog = "clear" | "stats" | "delete" | null;

/** The three dialogs of the history page; only the one named by `dialog` is open. */
export function HistoryDialogs({
  dialog,
  close,
  total,
  picked,
  onChanged,
}: {
  dialog: HistoryDialog;
  close: () => void;
  total: number;
  picked: ReadonlySet<string> | null;
  onChanged: (cleared: boolean) => void;
}) {
  return (
    <>
      <StatsDialog open={dialog === "stats"} onClose={close} />
      <DeleteSelectedDialog
        count={dialog === "delete" ? (picked?.size ?? 0) : 0}
        onClose={close}
        onConfirm={async () => {
          await dictation.historyRemoveMany([...(picked ?? [])]);
          close();
          onChanged(false);
        }}
      />
      <ClearDialog
        open={dialog === "clear"}
        count={total}
        onClose={close}
        onConfirm={async () => {
          await dictation.historyClear();
          close();
          onChanged(true);
        }}
      />
    </>
  );
}
