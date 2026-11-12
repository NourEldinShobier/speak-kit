import { useEffect, useState } from "react";
import { addTerm, updateTerm, type Term } from "@speakkit/dictation";
import { Button, Modal, TextInput } from "@speakkit/ui";
import { checkDraft, parseSounds } from "./model";

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

/** Add or edit a word: the word or name, and how the speech model tends to hear it. Add stays disabled until a word is typed and the checks pass. */
export function WordDialog({ open, onClose, terms, editing, title, onSave, shared, onShow }: WordDialogProps) {
  const [word, setWord] = useState("");
  const [sounds, setSounds] = useState("");
  useEffect(() => {
    if (!open) return;
    setWord(editing?.word ?? "");
    setSounds(editing?.soundsLike.join(", ") ?? "");
  }, [open, editing]);
  const check = checkDraft(terms, { word, soundsLike: sounds }, editing?.id);
  const overrides = !check.blocked && shared?.some((t) => t.word.toLowerCase() === word.trim().toLowerCase());
  const submit = () => {
    if (check.blocked) return;
    const input = { word, soundsLike: parseSounds(sounds) };
    const r = editing ? updateTerm(terms, editing.id, input) : addTerm(terms, input);
    if (!r.ok) return;
    onSave(r.list);
    onClose();
  };
  const over = check.counter?.over === true;
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
        <TextInput label="Word or name" placeholder="Kubernetes" value={word} onChange={(e) => setWord(e.target.value)} error={check.message} data-autofocus="" autoComplete="off" spellCheck={false} />
        <div className="vocab-form__meta">
          {check.existing && onShow ? (
            <Button
              size="sm"
              onClick={() => {
                onShow(check.existing as Term);
                onClose();
              }}
            >
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
        <TextInput
          label="Sounds like"
          hint="How the speech model tends to write it, separated by commas. Optional."
          placeholder="cooper netties, kuber nettys"
          value={sounds}
          onChange={(e) => setSounds(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {overrides ? (
          <p className="vocab-note vocab-note--warn" role="status">
            The shared list has the same word. This mode&apos;s spelling is used here.
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
