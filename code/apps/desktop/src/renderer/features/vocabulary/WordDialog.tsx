import { useEffect, useState } from "react";
import { addTerm, swapOnlyByDefault, updateTerm, type Term } from "@speakkit/dictation";
import { Button, Checkbox, Modal, TextInput } from "@speakkit/ui";
import { checkDraft, parseSounds, type DraftCheck } from "./model";

export interface WordDialogProps {
  open: boolean;
  onClose(): void;
  /** The list the word is added to (the shared list or a mode's own). */
  terms: readonly Term[];
  /** A word being edited, or undefined for a new one. */
  editing?: Term | undefined;
  /** Dialog title: "Add a word", or "Add a word to Code editor". */
  title?: string | undefined;
  /** Called with the new list once the word is accepted. */
  onSave(next: Term[]): void;
  /** Words of the shared list, for a mode's dialog: the same word there is not an error, but this mode's spelling wins. */
  shared?: readonly Term[];
  /** "Show entry": close and show the entry this word collides with. */
  onShow?: ((term: Term) => void) | undefined;
}

/** What the person types: the words, and the options of the entry. `swapOnly` is undefined while the word decides. */
interface Draft {
  word: string;
  sounds: string;
  app: string;
  matchCase: boolean;
  remove: boolean;
  swapOnly: boolean | undefined;
}

const draftOf = (t: Term | undefined): Draft => ({
  word: t?.word ?? "",
  sounds: t?.soundsLike.join(", ") ?? "",
  app: t?.app ?? "",
  matchCase: t?.matchCase === true,
  remove: t?.remove === true,
  swapOnly: t?.swapOnly,
});

interface FieldsProps {
  draft: Draft;
  check: DraftCheck;
  overrides: boolean;
  change(patch: Partial<Draft>): void;
  onShow?: (() => void) | undefined;
}

/** The word itself, with what is wrong with it, a way to the entry it collides with and its length. */
function WordInput({ word, check, change, onShow }: Pick<FieldsProps, "check" | "change" | "onShow"> & { word: string }) {
  const over = check.counter?.over === true;
  return (
    <>
      <TextInput
        label="Word or name"
        hint="The text to write."
        placeholder="Claude Code"
        value={word}
        onChange={(e) => change({ word: e.target.value })}
        error={check.message}
        data-autofocus=""
        autoComplete="off"
        spellCheck={false}
      />
      <div className="vocab-form__meta">
        {check.existing && onShow ? (
          <Button size="sm" onClick={onShow}>
            Show entry
          </Button>
        ) : (
          <span />
        )}
        {check.counter && (word.trim() || over) ? (
          <span className={`vocab-count${over ? " is-over" : ""}`} aria-live="polite">
            {check.counter.length} of {check.counter.max}
          </span>
        ) : null}
      </div>
    </>
  );
}

function WordFields({ draft, check, overrides, change, onShow }: FieldsProps) {
  return (
    <>
      <WordInput word={draft.word} check={check} change={change} onShow={onShow} />
      <TextInput
        label="Heard as"
        hint="How the speech model tends to write it, separated by commas. Optional."
        placeholder="cloud code, clawd code"
        value={draft.sounds}
        onChange={(e) => change({ sounds: e.target.value })}
        autoComplete="off"
        spellCheck={false}
      />
      <TextInput
        label="Only in this app"
        hint="The program file name, such as code.exe. Leave empty for every app."
        placeholder="code.exe"
        value={draft.app}
        onChange={(e) => change({ app: e.target.value })}
        autoComplete="off"
        spellCheck={false}
      />
      {overrides ? (
        <p className="vocab-note vocab-note--warn" role="status">
          The shared list has the same word. This mode&apos;s spelling is used here.
        </p>
      ) : null}
    </>
  );
}

function MoreOptions({ draft, change }: Pick<FieldsProps, "draft" | "change">) {
  const swapOnly = draft.swapOnly ?? swapOnlyByDefault(draft.word);
  return (
    <details className="vocab-more">
      <summary>More options</summary>
      <div className="vocab-more__body">
        <Checkbox label="Match capital letters" checked={draft.matchCase} onChange={(e) => change({ matchCase: e.target.checked })} />
        <Checkbox label="Remove this phrase instead of writing the word" checked={draft.remove} onChange={(e) => change({ remove: e.target.checked })} />
        <Checkbox label="Only swap, do not tell the speech model" checked={swapOnly || draft.remove} disabled={draft.remove} onChange={(e) => change({ swapOnly: e.target.checked })} />
      </div>
    </details>
  );
}

/** Add or edit a word: the word or name, how the speech model tends to hear it, where it applies and how it is swapped. Add stays disabled until a word is typed and the checks pass. */
export function WordDialog({ open, onClose, terms, editing, title, onSave, shared, onShow }: WordDialogProps) {
  const [draft, setDraft] = useState<Draft>(draftOf(undefined));
  useEffect(() => {
    if (open) setDraft(draftOf(editing));
  }, [open, editing]);
  const check = checkDraft(terms, { word: draft.word, soundsLike: draft.sounds, app: draft.app }, editing?.id);
  const overrides = !check.blocked && !!shared?.some((t) => t.word.toLowerCase() === draft.word.trim().toLowerCase());
  const submit = () => {
    if (check.blocked) return;
    const { sounds, swapOnly, ...rest } = draft;
    const input = { ...rest, soundsLike: parseSounds(sounds), swapOnly: swapOnly === swapOnlyByDefault(draft.word) ? undefined : swapOnly };
    const r = editing ? updateTerm(terms, editing.id, input) : addTerm(terms, input);
    if (!r.ok) return;
    onSave(r.list);
    onClose();
  };
  const show = onShow && check.existing ? () => (onShow(check.existing as Term), onClose()) : undefined;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? (editing ? "Edit word" : "Add a word")}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={check.blocked} onClick={submit}>
            {editing ? "Save" : "Add word"}
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
        <WordFields draft={draft} check={check} overrides={overrides} change={(patch) => setDraft((d) => ({ ...d, ...patch }))} onShow={show} />
        <MoreOptions draft={draft} change={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
