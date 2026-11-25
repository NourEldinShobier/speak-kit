import { useEffect, useMemo, useState } from "react";
import { MAX_SOUNDS } from "@speakkit/dictation";
import { Banner, Button, IconButton, Modal } from "@speakkit/ui";
import type { HistoryItem } from "../../../shared/dictation/contract";
import { patchDictation, useDictation } from "../dictation-bridge";
import { fixLabel, keepsAll, saveFixes, suggestionsFor } from "./model";
import "./corrections.css";

/** One line per fix found in the edit, each with a button that leaves it out. */
function Found({ labels, remove }: { labels: readonly string[]; remove: (label: string) => void }) {
  if (labels.length === 0) return <p className="corr-fix__hint">Change only the misheard words, for example &ldquo;cloud code&rdquo; to &ldquo;Claude Code&rdquo;.</p>;
  return (
    <ul className="corr-fix__list" aria-label="Fixes found">
      {labels.map((label) => (
        <li key={label}>
          <span>{label}</span>
          <IconButton name="x" label={`Remove ${label}`} size={24} onClick={() => remove(label)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Fix a dictation: the person corrects the text, Speak Kit shows the misheard words it can see, one line each, and Save keeps them as words that apply from the next dictation on.
 * The text is compared here and never leaves the page; only the saved words go to the settings.
 */
export function FixDialog({ item, onClose }: { item: HistoryItem | null; onClose: () => void }) {
  const s = useDictation();
  const [edited, setEdited] = useState("");
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!item) return;
    setEdited(item.text.trim());
    setRemoved(new Set());
    setFull(false);
  }, [item]);
  const found = useMemo(() => (item ? suggestionsFor(item.text.trim(), edited.trim()) : []), [item, edited]);
  const chosen = found.filter((f) => !removed.has(fixLabel(f)));
  const save = async () => {
    if (!item || !s || chosen.length === 0) return;
    const terms = saveFixes(s.settings.terms, chosen, { now: Date.now(), source: item.id, app: item.app });
    const kept = keepsAll(terms, chosen);
    setFull(!kept);
    if (!kept) return;
    await patchDictation({ terms });
    onClose();
  };
  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title="Fix this dictation"
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={chosen.length === 0} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="corr-fix">
        <textarea className="sk-area" aria-label="Corrected text" value={edited} onChange={(e) => setEdited(e.target.value)} rows={5} data-autofocus />
        <Found labels={chosen.map(fixLabel)} remove={(label) => setRemoved((r) => new Set([...r, label]))} />
        {full ? (
          <Banner tone="warning" role="alert">
            {`Nothing was saved: the list of words is full, or a word already has ${MAX_SOUNDS} heard-as spellings. Remove some first.`}
          </Banner>
        ) : null}
      </div>
    </Modal>
  );
}
