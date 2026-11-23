import { useEffect, useState } from "react";
import { Button, Modal, TextInput } from "@speakkit/ui";
import type { DocMeta } from "../../../shared/library/contract";
import { useT } from "../../i18n";
import { library } from "./api";

export function RenameDialog({ doc, onClose, onDone }: { doc: DocMeta | null; onClose(): void; onDone(): void }) {
  const { t } = useT();
  const [title, setTitle] = useState(doc?.title ?? "");
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={t("lib.renameTitle")}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => doc && void library.rename(doc.id, title).then(onDone)}>
            {t("lib.save")}
          </Button>
        </>
      }
    >
      <TextInput label={t("lib.titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} />
    </Modal>
  );
}

export function DeleteDialog({ doc, onClose, onConfirm }: { doc: DocMeta | null; onClose(): void; onConfirm(): void }) {
  const { t: tr } = useT();
  // The dialog focuses its first control (the close button) on open; Cancel is the safe default.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => document.querySelector<HTMLElement>("[data-default-focus]")?.focus(), 50);
    return () => clearTimeout(t);
  }, [doc]);
  const copy = doc?.source === "paste" ? tr("lib.deletePaste") : tr("lib.deleteFile");
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={tr("lib.deleteTitle", { title: doc?.title ?? "" })}
      width={440}
      footer={
        <>
          <Button onClick={onClose} data-default-focus>
            {tr("common.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {tr("lib.delete")}
          </Button>
        </>
      }
    >
      <p className="lib-muted">{copy}</p>
    </Modal>
  );
}
