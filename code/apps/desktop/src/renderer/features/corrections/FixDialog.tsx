import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Modal } from "@speakkit/ui";
import type { HistoryItem } from "../../../shared/dictation/contract";
import { patchDictation, useDictation } from "../dictation-bridge";
import { fixLabel, saveFixes, suggestionsFor } from "./model";
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
 * Fix a dictation: the person corrects the text, Speak Kit lists the misheard words it can see, and the ticked ones are saved as corrections that apply from the next dictation on.
 * The text is compared here and never leaves the page; only the saved words go to the settings.
 */
export function FixDialog({ item, onClose }: { item: HistoryItem | null; onClose: () => void }) {
  const s = useDictation();
  const [edited, setEdited] = useState("");
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [onlyHere, setOnlyHere] = useState(false);
  const [copy, setCopy] = useState(false);
  useEffect(() => {
    if (!item) return;
    setEdited(item.text.trim());
    setOff(new Set());
    setOnlyHere(false);
    setCopy(false);
  }, [item]);
  const found = useMemo(() => (item ? suggestionsFor(item.text.trim(), edited.trim()) : []), [item, edited]);
  const chosen = found.filter((f) => !off.has(fixLabel(f)));
  const save = async () => {
    if (!item || !s || chosen.length === 0) return;
    await patchDictation({ corrections: saveFixes(s.settings.corrections, chosen, { now: Date.now(), source: item.id, ...(onlyHere && item.app && { app: item.app }) }) });
    if (copy) await navigator.clipboard.writeText(edited.trim()).catch(() => undefined);
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
        {item?.app ? <Checkbox label={`Only in ${item.appName ?? item.app}`} checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} /> : null}
        <Checkbox label="Also copy the corrected text" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
        <p className="corr-fix__hint">Saved fixes swap the exact words you heard, in any capitals, after every dictation.</p>
      </div>
    </Modal>
  );
}
