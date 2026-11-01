import { Button, Modal } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { quitSummary } from "../shared/quit";
import { api } from "./ui";

/** Quit confirmation (K11): says what stops and how to resume it; "Keep running in tray" is the safe choice. */
export function QuitDialog({ s, open, playing, onClose }: { s: AppState; open: boolean; playing: boolean; onClose(): void }) {
  const { lead, rows } = quitSummary(s, playing);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quit SpeakKit?"
      width={480}
      footer={
        <>
          <Button onClick={onClose}>Keep running in tray</Button>
          <span style={{ flex: 1 }} />
          <Button variant="danger" solid onClick={() => api.quit()}>
            Quit
          </Button>
        </>
      }
    >
      <p className="sk-modal-text">{lead}</p>
      <div className="sk-quit" data-testid="quit-list">
        {rows.map(([a, b]) => (
          <div key={a}>
            {a}
            <span>{b}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
