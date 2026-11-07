import { useReducer } from "react";
import { Banner, Button, Modal, TextInput } from "@speakkit/ui";
import type { DocMeta } from "../../../shared/library/contract";
import { errorText } from "../../error-text";
import { library } from "./api";
import { initUrl, urlReducer } from "./add-model";

interface UrlProps {
  open: boolean;
  onClose(): void;
  onAdded(doc: DocMeta): void;
  onPasteInstead(): void;
}

function FailedBanner({ message, details, onToggle }: { message: string; details: boolean; onToggle(): void }) {
  return (
    <Banner
      tone="warning"
      title="That page could not be added"
      action={
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {details ? "Hide details" : "Details"}
        </Button>
      }
    >
      Some sites block automatic reading. Copy the article text and paste it instead.
      {details && (
        <div className="lib-muted" data-testid="url-details">
          {message}
        </div>
      )}
    </Banner>
  );
}

export function UrlDialog({ open, onClose, onAdded, onPasteInstead }: UrlProps) {
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
      title="Add from a web address"
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {failed ? (
            <Button variant="primary" onClick={onPasteInstead}>
              Paste text instead
            </Button>
          ) : (
            <Button variant="primary" loading={fetching} disabled={!st.url.trim() || fetching} onClick={() => void go()}>
              {fetching ? "Fetching" : "Add"}
            </Button>
          )}
        </>
      }
    >
      <div className="lib-form">
        <TextInput
          label="Web address"
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
