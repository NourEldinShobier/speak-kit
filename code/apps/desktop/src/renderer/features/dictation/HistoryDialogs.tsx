import { useEffect, useState } from "react";
import { Button, Modal, Toggle } from "@speakkit/ui";
import { dictation } from "./api";

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

export function RecordingsDialog({ open, on, onClose }: { open: boolean; on: boolean; onClose: () => void }) {
  const [value, setValue] = useState(on);
  useEffect(() => {
    if (open) setValue(on);
  }, [open, on]);
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
              void dictation.patchSettings({ keepRecordings: value });
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
        <ul className="dict-keep__list">
          <li>Off until you turn it on.</li>
          <li>Recordings use up to 512 MB. The oldest are removed first, and their entries keep the text.</li>
          <li>A recording is deleted with its entry.</li>
          <li>Nothing leaves this computer.</li>
        </ul>
      </div>
    </Modal>
  );
}
