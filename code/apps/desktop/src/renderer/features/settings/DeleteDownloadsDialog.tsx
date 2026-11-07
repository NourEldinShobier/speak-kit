import { Button, Modal } from "@speakkit/ui";
import type { DownloadsReport } from "../../../shared/app-data";
import type { StorageInfo } from "../../../shared/ipc";
import { downloadRows, resultText } from "./downloads";

export type DeletePhase = { step: "closed" } | { step: "confirm" } | { step: "working" } | { step: "done"; report: DownloadsReport } | { step: "failed"; message: string };

interface Props {
  phase: DeletePhase;
  storage: Pick<StorageInfo, "modelsBytes" | "enginesBytes" | "cacheBytes">;
  onConfirm(): void;
  onClose(): void;
}

/** The text between the title and the buttons; a component of its own so a test can render it without the dialog portal. */
export function DeleteDownloadsBody({ phase, storage }: Pick<Props, "phase" | "storage">) {
  if (phase.step === "done")
    return (
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {resultText(phase.report)}
      </p>
    );
  if (phase.step === "failed")
    return (
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {phase.message}
      </p>
    );
  return (
    <>
      <p className="sk-modal-text">These files are deleted from this computer. Your library, cloned voices and settings stay.</p>
      <div className="sk-quit" data-testid="delete-downloads-list">
        {downloadRows(storage).map(([a, b]) => (
          <div key={a}>
            {a}
            <span>{b}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Confirmation for Settings > Storage > Delete downloaded models and engines (H6c): sizes first, then the result. */
export function DeleteDownloadsDialog({ phase, storage, onConfirm, onClose }: Props) {
  const finished = phase.step === "done" || phase.step === "failed";
  return (
    <Modal
      open={phase.step !== "closed"}
      onClose={phase.step === "working" ? () => {} : onClose}
      title={finished ? "Downloads removed" : "Delete downloaded models and engines?"}
      width={480}
      footer={
        finished ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={phase.step === "working"}>
              Cancel
            </Button>
            <span style={{ flex: 1 }} />
            <Button variant="danger" onClick={onConfirm} disabled={phase.step === "working"}>
              {phase.step === "working" ? "Deleting..." : "Delete"}
            </Button>
          </>
        )
      }
    >
      <DeleteDownloadsBody phase={phase} storage={storage} />
    </Modal>
  );
}
