import { Button, Modal } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { quitSummary } from "../shared/quit";
import { useT } from "./i18n";
import { api } from "./ui";

/** Quit confirmation: says what stops and how to resume it; "Keep running in tray" is the safe choice. */
export function QuitDialog({ s, open, playing, onClose }: { s: AppState; open: boolean; playing: boolean; onClose(): void }) {
  const lang = useT();
  const { t } = lang;
  const { lead, rows } = quitSummary(s, playing, lang);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("quit.title")}
      width={480}
      footer={
        <>
          <Button data-autofocus onClick={onClose}>
            {t("quit.keep")}
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="danger" onClick={() => api.quit()}>
            {t("quit.quit")}
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
