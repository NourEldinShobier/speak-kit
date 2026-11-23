import { useEffect, useState } from "react";
import { Button, Modal, Select, Toggle } from "@speakkit/ui";
import { dictation, patchDictation } from "./api";
import { AUDIO_CAPS_MB } from "../../../shared/dictation/settings";

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
        This deletes {count} {count === 1 ? "entry" : "entries"} from this computer, and the recordings kept with them. It does not change text already typed into other apps. You cannot undo it.
      </p>
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
        This deletes the selected entries from this computer, and the recordings kept with them. It does not change text already typed into other apps. You cannot undo it.
      </p>
    </Modal>
  );
}

const CAP_OPTIONS = AUDIO_CAPS_MB.map((mb) => ({ value: String(mb), label: mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB` }));

export function RecordingsDialog({ open, on, capMb, onClose }: { open: boolean; on: boolean; capMb: number; onClose: () => void }) {
  const [value, setValue] = useState(on);
  const [cap, setCap] = useState(capMb);
  useEffect(() => {
    if (open) {
      setValue(on);
      setCap(capMb);
    }
  }, [open, on, capMb]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keep recordings"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              void patchDictation({ keepRecordings: value, audioCapMb: cap as (typeof AUDIO_CAPS_MB)[number] });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="dict-keep">
        <label className="dict-keep__row">
          <span>Keep the audio of each dictation</span>
          <Toggle aria-label="Keep the audio of each dictation" checked={value} onChange={setValue} />
        </label>
        <label className="dict-keep__row">
          <span>Most space recordings may use</span>
          <Select label="Most space recordings may use" value={String(cap)} onChange={(v) => setCap(Number(v))} options={CAP_OPTIONS} />
        </label>
        <ul className="dict-keep__list">
          <li>Off until you turn it on.</li>
          <li>The oldest recordings are removed first when they pass the size below, and their entries keep the text.</li>
          <li>A recording is deleted with its entry.</li>
          <li>Nothing leaves this computer.</li>
        </ul>
      </div>
    </Modal>
  );
}

export type HistoryDialog = "clear" | "delete" | "recordings" | null;

/** The dialogs of the history page; only the one named by `dialog` is open. */
export function HistoryDialogs({
  dialog,
  close,
  total,
  picked,
  keepRecordings,
  audioCapMb,
  onChanged,
}: {
  dialog: HistoryDialog;
  close: () => void;
  total: number;
  picked: ReadonlySet<string> | null;
  keepRecordings: boolean;
  audioCapMb: number;
  onChanged: (cleared: boolean) => void;
}) {
  return (
    <>
      <RecordingsDialog open={dialog === "recordings"} on={keepRecordings} capMb={audioCapMb} onClose={close} />
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
