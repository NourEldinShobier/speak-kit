import { useState } from "react";
import { Button, Modal } from "@speakkit/ui";
import { useT } from "./i18n";
import { api } from "./ui";

const mask = (token: string, starting: string) => (token ? `${"•".repeat(14)}-${token.slice(-4)}` : starting);

function RegenerateModal({ open, busy, onClose, onConfirm }: { open: boolean; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("regen.title")}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {t("regen.confirm")}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {t("regen.body")}
      </p>
    </Modal>
  );
}

/** Pairing token: masked until revealed. Regenerate can ask for confirmation (Settings) or act at once (Home). */
export function TokenField({ token, regenerate, confirmRegenerate, onCopied }: { token: string; regenerate?: boolean; confirmRegenerate?: boolean; onCopied?: () => void }) {
  const { t } = useT();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const doRegenerate = async () => {
    setBusy(true);
    try {
      await api.regenerateToken();
      setShown(false);
    } finally {
      setBusy(false);
      setAsk(false);
    }
  };
  return (
    <div className="sk-token">
      <div className="sk-token__box" data-testid="token" data-revealed={shown}>
        {shown ? token : mask(token, t("token.starting"))}
      </div>
      <Button iconLeft={shown ? "eye-off" : "eye"} aria-pressed={shown} onClick={() => setShown(!shown)}>
        {shown ? t("token.hide") : t("token.reveal")}
      </Button>
      <Button
        variant="primary"
        iconLeft="copy"
        disabled={!token}
        onClick={async () => {
          await api.copy(token);
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? t("common.copied") : t("common.copy")}
      </Button>
      {regenerate && (
        <Button iconLeft="refresh" disabled={busy} onClick={() => (confirmRegenerate ? setAsk(true) : doRegenerate())}>
          {t("regen.confirm")}
        </Button>
      )}
      {confirmRegenerate && <RegenerateModal open={ask} busy={busy} onClose={() => setAsk(false)} onConfirm={doRegenerate} />}
    </div>
  );
}
