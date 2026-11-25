import { useState } from "react";
import {
  copyOf,
  MAX_STYLE_LINE,
  MAX_STYLE_NAME,
  MAX_STYLE_PROMPT,
  MAX_STYLES,
  removeStyle,
  saveStyle,
  styleDraftError,
  styleUsers,
  TEMPLATE_IDS,
  TEMPLATES,
  type CustomStyle,
  type StyleDraft,
  type StyleError,
} from "@speakkit/dictation";
import { Button, Checkbox, Modal, SettingRow, TextInput } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { patchDictation } from "../dictation-bridge";
import { wordCount } from "./model";

const HINT = "Say what to change and what to keep. The app always adds: keep meaning, language, numbers; never answer the text; reply with the text only.";

/** Only a limit that was passed is shown as an error: an empty field just keeps Save off. */
const LIMITS: Partial<Record<StyleError, string>> = {
  "name-too-long": `Names can be up to ${MAX_STYLE_NAME} characters.`,
  "line-too-long": `The description can be up to ${MAX_STYLE_LINE} characters.`,
  "prompt-too-long": `The instruction can be up to ${MAX_STYLE_PROMPT} characters.`,
};

const draftOf = (s?: CustomStyle): StyleDraft => ({ name: s?.name ?? "", line: s?.line ?? "", prompt: s?.prompt ?? "", keepsLists: s?.keepsLists ?? false });

function StyleDialog({ editing, styles, onClose }: { editing: CustomStyle | undefined; styles: readonly CustomStyle[]; onClose(): void }) {
  const [draft, setDraft] = useState(() => draftOf(editing));
  const next = saveStyle(styles, draft, editing?.id);
  const error = styleDraftError(draft);
  const set = (change: Partial<StyleDraft>) => setDraft({ ...draft, ...change });
  const submit = () => {
    if (!next) return;
    void patchDictation({ styles: next });
    onClose();
  };
  const footer = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!next} onClick={submit}>
        Save style
      </Button>
    </>
  );
  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${editing.name}` : "Add a style"} width={480} footer={footer}>
      <form
        className="vocab-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextInput
          label="Name"
          placeholder="Support reply"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          error={error === "name-too-long" ? LIMITS[error] : undefined}
          data-autofocus=""
          autoComplete="off"
        />
        <TextInput
          label="Short description (optional)"
          placeholder="For customer emails"
          value={draft.line}
          onChange={(e) => set({ line: e.target.value })}
          error={error === "line-too-long" ? LIMITS[error] : undefined}
          autoComplete="off"
        />
        <label className="lm-field__label" htmlFor="style-prompt">
          Instruction
        </label>
        <textarea id="style-prompt" className="sk-area" rows={6} value={draft.prompt} onChange={(e) => set({ prompt: e.target.value })} />
        <p className="vocab-note">
          {wordCount(draft.prompt)} words. {error === "prompt-too-long" ? LIMITS[error] : HINT}
        </p>
        <Checkbox label="Keeps lists and line breaks" checked={draft.keepsLists} onChange={(e) => set({ keepsLists: e.target.checked })} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function DeleteStyleDialog({ style, styles, users, onClose }: { style: CustomStyle; styles: readonly CustomStyle[]; users: string[]; onClose(): void }) {
  const confirm = () => {
    void patchDictation({ styles: removeStyle(styles, style.id) });
    onClose();
  };
  const footer = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="danger" onClick={confirm}>
        Delete style
      </Button>
    </>
  );
  return (
    <Modal open onClose={onClose} title={`Delete ${style.name}?`} width={420} footer={footer}>
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {users.length ? `Used by ${users.join(", ")}. They go back to Tidy. ` : "No mode uses it. "}You cannot undo it.
      </p>
    </Modal>
  );
}

type Dialog = { kind: "edit"; style?: CustomStyle } | { kind: "delete"; style: CustomStyle };

/** Every writing style: the built-in ones to copy, and the person's own to edit or delete. */
export function StylesCard({ s }: { s: DictationStatus }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { styles, modes, rewriteDefault } = s.settings;
  const full = styles.length >= MAX_STYLES;
  const duplicate = (from: Parameters<typeof copyOf>[0]) => {
    const next = saveStyle(styles, copyOf(from));
    if (next) void patchDictation({ styles: next });
  };
  return (
    <>
      <SettingRow
        className="lm-row--control"
        label="Writing styles"
        description={`The built-in styles can be copied and changed. You can add up to ${MAX_STYLES} of your own.`}
        control={
          <Button iconLeft="plus" disabled={full} onClick={() => setDialog({ kind: "edit" })}>
            Add style
          </Button>
        }
      />
      <ul className="vocab-list" aria-label="Writing styles">
        {TEMPLATE_IDS.map((id) => (
          <li key={id}>
            <SettingRow
              label={TEMPLATES[id].name}
              description={TEMPLATES[id].line}
              control={
                <Button disabled={full} onClick={() => duplicate(TEMPLATES[id])}>
                  Duplicate
                </Button>
              }
            />
          </li>
        ))}
        {styles.map((c) => (
          <li key={c.id}>
            <SettingRow
              label={c.name}
              description={c.line || undefined}
              control={
                <div className="modes-acts">
                  <Button onClick={() => setDialog({ kind: "edit", style: c })}>Edit</Button>
                  <Button variant="danger" onClick={() => setDialog({ kind: "delete", style: c })}>
                    Delete
                  </Button>
                </div>
              }
            />
          </li>
        ))}
      </ul>
      {dialog?.kind === "edit" ? <StyleDialog key={dialog.style?.id ?? "new"} editing={dialog.style} styles={styles} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "delete" ? <DeleteStyleDialog style={dialog.style} styles={styles} users={styleUsers(dialog.style.id, modes, rewriteDefault)} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
