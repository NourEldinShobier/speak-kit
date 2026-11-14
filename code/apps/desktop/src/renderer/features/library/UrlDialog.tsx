import { useReducer } from "react";
import { Banner, Button, Modal, TextInput } from "@speakkit/ui";
import type { DocMeta } from "../../../shared/library/contract";
import { errorText } from "../../error-text";
import { useT } from "../../i18n";
import { library } from "./api";
import { initUrl, urlReducer } from "./add-model";

interface UrlProps {
  open: boolean;
  onClose(): void;
  onAdded(doc: DocMeta): void;
  onPasteInstead(): void;
}

function FailedBanner({ message, details, onToggle }: { message: string; details: boolean; onToggle(): void }) {
  const { t } = useT();
  return (
    <Banner
      tone="warning"
      title={t("lib.urlFailTitle")}
      action={
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {details ? t("lib.hideDetails") : t("lib.details")}
        </Button>
      }
    >
      {t("lib.urlFailBody")}
      {details && (
        <div className="lib-muted" data-testid="url-details">
          {message}
        </div>
      )}
    </Banner>
  );
}

export function UrlDialog({ open, onClose, onAdded, onPasteInstead }: UrlProps) {
  const { t } = useT();
  const [st, dispatch] = useReducer(urlReducer, undefined, initUrl);
  const fetching = st.phase.kind === "fetching";
  const go = async () => {
    dispatch({ type: "fetch" });
    const r = await library.importUrl(st.url);
    if (!r.ok) return dispatch({ type: "failed", message: errorText(r.error) });
    dispatch({ type: "added" });
    onAdded(r.doc);
  };
  const failed = st.phase.kind === "failed" ? st.phase : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("lib.urlTitle")}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          {failed ? (
            <Button variant="primary" onClick={onPasteInstead}>
              {t("lib.pasteInstead")}
            </Button>
          ) : (
            <Button variant="primary" loading={fetching} disabled={!st.url.trim() || fetching} onClick={() => void go()}>
              {fetching ? t("lib.fetching") : t("lib.addBtn")}
            </Button>
          )}
        </>
      }
    >
      <div className="lib-form">
        <TextInput
          label={t("lib.urlLabel")}
          value={st.url}
          readOnly={fetching}
          onChange={(e) => dispatch({ type: "url", url: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && st.url.trim() && !fetching && void go()}
          placeholder="https://example.com/article"
          icon="link"
          autoFocus
        />
        {failed && <FailedBanner message={failed.message} details={st.details} onToggle={() => dispatch({ type: "toggle-details" })} />}
      </div>
    </Modal>
  );
}
