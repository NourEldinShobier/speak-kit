import { useEffect, useMemo, useState } from "react";
import { MAX_SOUNDS } from "@speakkit/dictation";
import { Banner, Button, Checkbox, Modal } from "@speakkit/ui";
import type { HistoryItem } from "../../../shared/dictation/contract";
import { patchDictation, useDictation } from "../dictation-bridge";
import { fixLabel, keepsAll, limitByDefault, saveFixes, scopeLabel, suggestionsFor } from "./model";
import "./corrections.css";

/** The fixes found in the edit, each with a box; one is left out when its box is cleared. */
function Suggestions({ found, off, toggle }: { found: ReturnType<typeof suggestionsFor>; off: ReadonlySet<string>; toggle: (key: string) => void }) {
  if (found.length === 0) return <p className="corr-fix__hint">No fix found yet. Change only the misheard words, for example &ldquo;cloud code&rdquo; to &ldquo;Claude Code&rdquo;.</p>;
  return (
    <ul className="corr-fix__list" aria-label="Fixes found">
      {found.map((f) => (
        <li key={fixLabel(f)}>
          <Checkbox label={fixLabel(f)} checked={!off.has(fixLabel(f))} onChange={() => toggle(fixLabel(f))} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Fix a dictation: the person corrects the text, Speak Kit lists the misheard words it can see, and the ticked ones are saved as words that apply from the next dictation on.
 * The text is compared here and never leaves the page; only the saved words go to the settings.
 */
export function FixDialog({ item, onClose }: { item: HistoryItem | null; onClose: () => void }) {
  const s = useDictation();
  const [edited, setEdited] = useState("");
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState<boolean | undefined>(undefined);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!item) return;
    setEdited(item.text.trim());
    setOff(new Set());
    setLimit(undefined);
    setFull(false);
  }, [item]);
  const found = useMemo(() => (item ? suggestionsFor(item.text.trim(), edited.trim()) : []), [item, edited]);
  const chosen = found.filter((f) => !off.has(fixLabel(f)));
  const onlyHere = limit ?? limitByDefault(chosen);
  const save = async () => {
    if (!item || !s || chosen.length === 0) return;
    const terms = saveFixes(s.settings.terms, chosen, { now: Date.now(), source: item.id, ...(onlyHere && item.app && { app: item.app }) });
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
            Save corrections
          </Button>
        </>
      }
    >
      <div className="corr-fix">
        <textarea className="sk-area" aria-label="Corrected text" value={edited} onChange={(e) => setEdited(e.target.value)} rows={5} data-autofocus />
        <Suggestions found={found} off={off} toggle={(key) => setOff((o) => new Set(o.has(key) ? [...o].filter((k) => k !== key) : [...o, key]))} />
        {full ? (
          <Banner tone="warning" role="alert">
            {`Nothing was saved: the list of words is full, or a word already has ${MAX_SOUNDS} heard-as spellings. Remove some first.`}
          </Banner>
        ) : null}
        {item?.app ? <Checkbox label={scopeLabel({ app: item.app, appName: item.appName })} checked={onlyHere} onChange={(e) => setLimit(e.target.checked)} /> : null}
        <p className="corr-fix__hint">Saved fixes are added to your words and swap the exact words you heard, in any capitals, after every dictation. You can change where they apply there.</p>
      </div>
    </Modal>
  );
}
