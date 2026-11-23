import { useReducer } from "react";
import { Banner, Button, Modal, TextInput } from "@speakkit/ui";
import { errorText } from "../../error-text";
import { useT } from "../../i18n";
import type { DocMeta } from "../../../shared/library/contract";
import { library } from "./api";
import { countWords, initPaste, pasteReducer } from "./add-model";
import { clock, estimateMs } from "./model";

interface PasteProps {
  open: boolean;
  speed: number;
  onClose(): void;
  onAdded(doc: DocMeta, play: boolean): void;
}

function PasteForm({ speed, st, dispatch }: Pick<PasteProps, "speed"> & { st: ReturnType<typeof initPaste>; dispatch: (a: Parameters<typeof pasteReducer>[1]) => void }) {
  const { t } = useT();
  const n = countWords(st.text);
  return (
    <div className="lib-form">
      <TextInput label={t("lib.titleOptional")} value={st.title} onChange={(e) => dispatch({ type: "title", title: e.target.value })} placeholder={t("lib.titleHint")} />
      <label className="lm-field__label" htmlFor="lib-paste">
        {t("lib.text")}
      </label>
      <textarea id="lib-paste" className="lib-textarea" rows={9} value={st.text} onChange={(e) => dispatch({ type: "text", text: e.target.value })} placeholder={t("lib.pastePlaceholder")} autoFocus />
      <div className="lib-form__row">
        <span className="lib-muted" data-testid="paste-count">
          {t("lib.count", { n, time: n ? clock(estimateMs(n, speed)) : "0:00", speed })}
        </span>
      </div>
      {st.error && <Banner tone="error">{st.error}</Banner>}
    </div>
  );
}

interface FooterProps {
  empty: boolean;
  onClose(): void;
  onAdd(play: boolean): void;
}

/** Cancel, Add and Add and play grouped at the right. */
export function PasteFooter({ empty, onClose, onAdd }: FooterProps) {
  const { t } = useT();
  return (
    <div className="lib-foot">
      <div className="lib-foot__actions">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button disabled={empty} onClick={() => onAdd(false)}>
          {t("lib.addBtn")}
        </Button>
        <Button variant="primary" iconLeft="player-play" disabled={empty} onClick={() => onAdd(true)}>
          {t("lib.addPlay")}
        </Button>
      </div>
    </div>
  );
}

export function PasteDialog({ open, speed, onClose, onAdded }: PasteProps) {
  const { t } = useT();
  const [st, dispatch] = useReducer(pasteReducer, undefined, initPaste);
  const empty = !countWords(st.text);
  const add = async (play: boolean) => {
    const r = await library.importText(st.text, st.title.trim() || undefined);
    if (!r.ok) return dispatch({ type: "failed", message: errorText(r.error) });
    dispatch({ type: "added" });
    onAdded(r.doc, play);
  };
  return (
    <Modal open={open} onClose={onClose} title={t("lib.pasteTitle")} width={560} footer={<PasteFooter empty={empty} onClose={onClose} onAdd={(play) => void add(play)} />}>
      <PasteForm speed={speed} st={st} dispatch={dispatch} />
    </Modal>
  );
}
