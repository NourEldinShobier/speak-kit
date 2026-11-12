import { useState } from "react";
import { addMode, removeMode, setApps, withDefault, withoutPristineDefault, type WritingMode as Mode, type ModeError } from "@speakkit/dictation";
import { Button, Chip, Icon, Modal, TextInput } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { dictation, useDictation } from "../dictation-bridge";
import { useLive } from "../vocabulary";
import { ModeDetail } from "./ModeDetail";
import { modeRow } from "./model";
import { RewriteCard } from "./RewriteCard";
import "./modes.css";

const LEAD = "A mode sets how dictation behaves in the apps you put in it: how text is inserted, capital letters, the end of the sentence, its own words and an optional rewrite.";

const NAME_ERRORS: Record<ModeError, string> = {
  empty: "",
  duplicate: "A mode with this name already exists.",
  "too-long": "Mode names can be up to 40 characters.",
  full: "There are too many modes.",
};

function AddModeDialog({ open, modes, onClose, onAdd }: { open: boolean; modes: readonly Mode[]; onClose(): void; onAdd(next: Mode[], created: Mode): void }) {
  const [name, setName] = useState("");
  const result = name.trim() ? addMode(modes, name) : null;
  const error = result && !result.ok ? NAME_ERRORS[result.error] : undefined;
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

function ModeRow({ mode, rewriteOn, onOpen }: { mode: Mode; rewriteOn: boolean; onOpen(): void }) {
  const r = modeRow(mode, rewriteOn);
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
      <Icon name="chevron-right" size={14} className="vocab-arrow" />
    </>
  );
  return (
    <li data-mode={r.id}>
      <button type="button" className="lm-row modes-row modes-row--btn" aria-label={`${r.name}, ${r.detail}`} onClick={onOpen}>
        {inner}
      </button>
    </li>
  );
}

function ModeList({ s, all, onOpen, onAdd }: { s: DictationStatus; all: Mode[]; onOpen(id: string): void; onAdd(): void }) {
  return (
    <Page
      title="Modes"
      lead={LEAD}
      action={
        <Button variant="primary" iconLeft="plus" onClick={onAdd}>
          Add mode
        </Button>
      }
    >
      <ul className="lm-card modes-list" aria-label="Modes">
        {all.map((m) => (
          <ModeRow key={m.id} mode={m} rewriteOn={s.settings.rewrite.enabled} onOpen={() => onOpen(m.id)} />
        ))}
      </ul>
      <RewriteCard s={s} />
      <p className="modes-note" role="note">
        Words from Vocabulary work in every mode. A mode&apos;s own words win when both spell the same thing differently.
      </p>
    </Page>
  );
}

function List({ s, modes, update }: { s: DictationStatus; modes: Mode[]; update(change: (m: Mode[]) => Mode[]): void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const all = withDefault(modes);
  // Changes start from the list with the default mode in it, so its choices are saved with the rest.
  const change = (f: (m: Mode[]) => Mode[]) => update((list) => withoutPristineDefault(f(withDefault(list))));
  const current = open ? all.find((m) => m.id === open) : undefined;
  if (current)
    return (
      <ModeDetail
        s={s}
        mode={current}
        others={all}
        onBack={() => setOpen(null)}
        onChange={(next) => change((list) => list.map((m) => (m.id === next.id ? next : m)))}
        onApps={(apps) => change((list) => setApps(list, current.id, apps))}
        onDelete={() => {
          change((list) => removeMode(list, current.id));
          setOpen(null);
        }}
      />
    );
  return (
    <>
      <ModeList s={s} all={all} onOpen={setOpen} onAdd={() => setAdding(true)} />
      <AddModeDialog
        open={adding}
        modes={all}
        onClose={() => setAdding(false)}
        onAdd={(next, created) => {
          update(() => withoutPristineDefault(next));
          setOpen(created.id);
        }}
      />
    </>
  );
}

function Loaded({ s }: { s: DictationStatus }) {
  const [modes, update] = useLive<Mode>(s.settings.modes, (next) => dictation.patchSettings({ modes: next }));
  return <List s={s} modes={modes} update={update} />;
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
