import { useState } from "react";
import { addMode, DEFAULT_MODE_ID, defaultMode, removeMode, setApps, type Mode } from "@speakkit/dictation";
import { Button, Chip, Icon, Modal, TextInput } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { dictation } from "../dictation-bridge";
import { useDictation } from "../dictation-bridge";
import { useLive } from "../vocabulary";
import "../vocabulary/vocabulary.css";
import { ModeDetail } from "./ModeDetail";
import { modeRow } from "./model";
import { RewriteCard } from "./RewriteCard";
import "./modes.css";

const LEAD = "A mode sets how dictation behaves in the apps you put in it: how text is inserted, capital letters, the end of the sentence, its own words and an optional rewrite.";

function AddModeDialog({ open, modes, onClose, onAdd }: { open: boolean; modes: readonly Mode[]; onClose(): void; onAdd(next: Mode[], created: Mode): void }) {
  const [name, setName] = useState("");
  const result = name.trim() ? addMode(modes, name) : null;
  const error =
    result && !result.ok
      ? result.error === "duplicate"
        ? "A mode with this name already exists."
        : result.error === "too-long"
          ? "Mode names can be up to 40 characters."
          : result.error === "full"
            ? "There are too many modes."
            : undefined
      : undefined;
  const submit = () => {
    if (!result?.ok) return;
    onAdd(result.modes, result.mode);
    setName("");
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a mode"
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!result?.ok} onClick={submit}>
            Add mode
          </Button>
        </>
      }
    >
      <form
        className="vocab-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextInput label="Name" placeholder="Code editor" value={name} onChange={(e) => setName(e.target.value)} error={error} data-autofocus="" autoComplete="off" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Modes: which apps get which dictation behaviour. */
export function ModesPage() {
  const s = useDictation();
  if (!s)
    return (
      <Page title="Modes" lead={LEAD}>
        {null}
      </Page>
    );
  return <Loaded s={s} />;
}

function Loaded({ s }: { s: DictationStatus }) {
  const [modes, update] = useLive<Mode>(s.settings.modes, (next) => dictation.patchSettings({ modes: next }));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const all = [defaultMode(), ...modes];
  const current = open ? modes.find((m) => m.id === open) : undefined;
  const rewriteOn = s.settings.rewrite.enabled;
  if (current)
    return (
      <ModeDetail
        s={s}
        mode={current}
        onBack={() => setOpen(null)}
        onChange={(next) => update((list) => list.map((m) => (m.id === next.id ? next : m)))}
        onApps={(apps) => update((list) => setApps([defaultMode(), ...list], current.id, apps).filter((m) => m.id !== DEFAULT_MODE_ID))}
        onDelete={() => {
          update((list) => removeMode([defaultMode(), ...list], current.id).filter((m) => m.id !== DEFAULT_MODE_ID));
          setOpen(null);
        }}
        others={modes}
      />
    );
  return (
    <Page
      title="Modes"
      lead={LEAD}
      action={
        <Button variant="primary" iconLeft="plus" onClick={() => setAdding(true)}>
          Add mode
        </Button>
      }
    >
      <ul className="lm-card modes-list" aria-label="Modes">
        {all.map((m) => {
          const r = modeRow(m, rewriteOn);
          const inner = (
            <>
              <span className="modes-tile" aria-hidden="true">
                {r.letter}
              </span>
              <span className="modes-row__text">
                <b>{r.name}</b>
                <span>{r.detail}</span>
              </span>
              <span className="modes-row__chips">
                {r.chips.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </span>
              {m.id === DEFAULT_MODE_ID ? <span className="modes-row__spacer" /> : <Icon name="chevron-right" size={14} className="vocab-arrow" />}
            </>
          );
          return (
            <li key={r.id} data-mode={r.id}>
              {m.id === DEFAULT_MODE_ID ? (
                <div className="lm-row modes-row">{inner}</div>
              ) : (
                <button type="button" className="lm-row modes-row modes-row--btn" aria-label={`${r.name}, ${r.detail}`} onClick={() => setOpen(m.id)}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <RewriteCard s={s} />
      <p className="modes-note" role="note">
        Words from Vocabulary work in every mode. A mode&apos;s own words win when both spell the same thing differently.
      </p>
      <AddModeDialog open={adding} modes={all} onClose={() => setAdding(false)} onAdd={(next, created) => (update(() => next.filter((m) => m.id !== DEFAULT_MODE_ID)), setOpen(created.id))} />
    </Page>
  );
}
