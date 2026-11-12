import { useState } from "react";
import { overridesShared, type Mode, type Term } from "@speakkit/dictation";
import { Button, Chip, Icon, Modal, Select, SettingRow, TextInput } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { WordDialog } from "../vocabulary";
import { appLabel, CAPITALS, ENDS, heardAs, INSERTS, SUGGESTED_APPS } from "./model";

function AddAppDialog({ open, mode, others, onClose, onSave }: { open: boolean; mode: Mode; others: readonly Mode[]; onClose(): void; onSave(apps: string[]): void }) {
  const [name, setName] = useState("");
  const key = name
    .trim()
    .toLowerCase()
    .replace(/\.exe$/, "");
  const owner = key ? others.find((m) => m.id !== mode.id && m.apps.includes(key)) : undefined;
  const have = mode.apps.includes(key);
  const choices = SUGGESTED_APPS.filter((a) => !mode.apps.includes(a));
  const submit = () => {
    if (!key || have) return;
    onSave([...mode.apps, key]);
    setName("");
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add an app to ${mode.name}`}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!key || have} onClick={submit}>
            Add app
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
        <TextInput
          label="Program name"
          hint="The name of the program's file without .exe, for example Code or slack."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={have ? `${appLabel(key)} is already in this mode.` : undefined}
          data-autofocus=""
          autoComplete="off"
          spellCheck={false}
        />
        {owner ? (
          <p className="vocab-note vocab-note--warn">
            {appLabel(key)} is in {owner.name} now. It moves to this mode.
          </p>
        ) : null}
        <div className="modes-suggest" role="group" aria-label="Common apps">
          {choices.map((a) => (
            <button key={a} type="button" className="lm-chip modes-suggest__btn" onClick={() => setName(a)}>
              {appLabel(a)}
            </button>
          ))}
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function DeleteDialog({ open, mode, onClose, onConfirm }: { open: boolean; mode: Mode; onClose(): void; onConfirm(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Delete ${mode.name}?`}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete mode
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        Its {mode.apps.length === 1 ? "app goes" : "apps go"} back to the Default mode, and its {mode.terms.length === 1 ? "word is" : "words are"} removed. You cannot undo it.
      </p>
    </Modal>
  );
}

const SHOWN = 3;

function ModeWords({ mode, shared, onChange }: { mode: Mode; shared: readonly Term[]; onChange(terms: Term[]): void }) {
  const [dialog, setDialog] = useState<{ editing?: Term } | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? mode.terms : mode.terms.slice(0, SHOWN);
  return (
    <div className="lm-card">
      <SettingRow
        label="Words for this mode"
        description={`Used only when you dictate in ${mode.name}. They win over the shared list.`}
        control={
          <div className="modes-acts">
            <Chip>
              {mode.terms.length} {mode.terms.length === 1 ? "word" : "words"}
            </Chip>
            <Button onClick={() => setDialog({})}>Add word</Button>
          </div>
        }
      />
      <ul className="vocab-list" aria-label={`Words for ${mode.name}`}>
        {shown.map((t) => (
          <li key={t.id} className="lm-row modes-word">
            <span className="modes-word__text">
              <b>{t.word}</b>
              {heardAs(t) ? <span>{heardAs(t)}</span> : null}
            </span>
            {overridesShared(shared, t) ? <Chip className="modes-warn">Replaces the shared spelling</Chip> : null}
            <span className="vocab-row__acts">
              <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Edit ${t.word}`} onClick={() => setDialog({ editing: t })}>
                <Icon name="pencil" size={14} />
              </button>
              <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Delete ${t.word}`} onClick={() => onChange(mode.terms.filter((x) => x.id !== t.id))}>
                <Icon name="trash" size={14} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {mode.terms.length === 0 ? <p className="vocab-empty-line">No words for this mode yet. The shared words still work here.</p> : null}
      {mode.terms.length > SHOWN ? (
        <div className="vocab-foot">
          <span>{all ? `Showing all ${mode.terms.length} words.` : `${mode.terms.length - SHOWN} more ${mode.terms.length - SHOWN === 1 ? "word" : "words"}`}</span>
          <Button size="sm" onClick={() => setAll((a) => !a)}>
            {all ? "Show fewer" : "Show all"}
          </Button>
        </div>
      ) : null}
      <WordDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        terms={mode.terms}
        editing={dialog?.editing}
        title={dialog?.editing ? undefined : `Add a word to ${mode.name}`}
        shared={shared}
        onSave={onChange}
      />
    </div>
  );
}

/** One mode: its apps, how it inserts and cleans up, the rewrite choice and its own words. */
export function ModeDetail({
  s,
  mode,
  others,
  onBack,
  onChange,
  onApps,
  onDelete,
}: {
  s: DictationStatus;
  mode: Mode;
  others: readonly Mode[];
  onBack(): void;
  onChange(next: Mode): void;
  onApps(apps: string[]): void;
  onDelete(): void;
}) {
  const [addApp, setAddApp] = useState(false);
  const [asking, setAsking] = useState(false);
  const rewriteReady = s.settings.rewrite.enabled;
  return (
    <Page
      title={mode.name}
      lead={`How dictation behaves in the apps below.`}
      action={
        <Button variant="danger" onClick={() => setAsking(true)}>
          Delete mode
        </Button>
      }
    >
      <button type="button" className="modes-back" onClick={onBack}>
        <Icon name="arrow-left" size={12} /> Modes
      </button>
      <div className="lm-card modes-apps">
        <span className="modes-apps__label">Apps</span>
        <span className="modes-apps__chips">
          {mode.apps.length === 0 ? <em>No apps yet</em> : null}
          {mode.apps.map((a) => (
            <Chip key={a}>
              {appLabel(a)}
              <button type="button" className="modes-chip-x" aria-label={`Remove ${appLabel(a)}`} onClick={() => onApps(mode.apps.filter((x) => x !== a))}>
                <Icon name="x" size={10} />
              </button>
            </Chip>
          ))}
        </span>
        <Button onClick={() => setAddApp(true)}>Add app</Button>
      </div>
      <div className="lm-card">
        <SettingRow
          className="lm-row--control"
          label="Insert text"
          description="How the text reaches the app."
          control={<Select label="Insert text" value={mode.insertMode} onChange={(v) => onChange({ ...mode, insertMode: v as Mode["insertMode"] })} options={INSERTS} />}
        />
        <SettingRow
          className="lm-row--control"
          label="Capital letters"
          description="Whether a sentence starts with a capital."
          control={<Select label="Capital letters" value={mode.capitals} onChange={(v) => onChange({ ...mode, capitals: v as Mode["capitals"] })} options={CAPITALS} />}
        />
        <SettingRow
          className="lm-row--control"
          label="End of dictation"
          description="Full stop or nothing after the last word."
          control={<Select label="End of dictation" value={mode.end} onChange={(v) => onChange({ ...mode, end: v as Mode["end"] })} options={ENDS} />}
        />
        <SettingRow
          className="lm-row--control"
          label="Rewrite pass"
          description={rewriteReady ? "Tidies the text with the writer after it is heard." : "Off in this mode. Set up the writer on the Modes page first."}
          control={
            <Select
              label="Rewrite pass"
              value={mode.rewrite && rewriteReady ? "on" : "off"}
              disabled={!rewriteReady}
              onChange={(v) => onChange({ ...mode, rewrite: v === "on" })}
              options={[
                { value: "off", label: "Off" },
                { value: "on", label: "On" },
              ]}
            />
          }
        />
      </div>
      <ModeWords mode={mode} shared={s.settings.terms} onChange={(terms) => onChange({ ...mode, terms })} />
      <AddAppDialog open={addApp} mode={mode} others={others} onClose={() => setAddApp(false)} onSave={onApps} />
      <DeleteDialog open={asking} mode={mode} onClose={() => setAsking(false)} onConfirm={onDelete} />
    </Page>
  );
}
