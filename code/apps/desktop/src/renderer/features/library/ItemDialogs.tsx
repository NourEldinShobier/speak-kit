import { useEffect, useState } from "react";
import { Button, Modal, Select, TextInput } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";
import { library } from "./api";
import { voiceOptions } from "./PasteDialog";

export function RenameDialog({ doc, onClose, onDone }: { doc: DocMeta | null; onClose(): void; onDone(): void }) {
  const [title, setTitle] = useState(doc?.title ?? "");
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title="Rename reading"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => doc && void library.rename(doc.id, title).then(onDone)}>
            Save
          </Button>
        </>
      }
    >
      <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} />
    </Modal>
  );
}

export function VoiceDialog({ doc, voices, defaultVoice, onClose, onDone }: { doc: DocMeta | null; voices: Voice[]; defaultVoice: string; onClose(): void; onDone(): void }) {
  const [voice, setVoice] = useState(doc?.voice ?? defaultVoice);
  const save = (v: string | null) => doc && void library.setVoice(doc.id, v).then(onDone);
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title="Voice for this reading"
      width={440}
      footer={
        <>
          <Button onClick={() => save(null)}>Use the app voice</Button>
          <Button variant="primary" onClick={() => save(voice)}>
            Save
          </Button>
        </>
      }
    >
      <Select label="Voice" options={voiceOptions(voices)} value={voice} onChange={setVoice} />
    </Modal>
  );
}

export function DeleteDialog({ doc, onClose, onConfirm }: { doc: DocMeta | null; onClose(): void; onConfirm(): void }) {
  // The dialog focuses its first control (the close button) on open; Cancel is the safe default.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => document.querySelector<HTMLElement>("[data-default-focus]")?.focus(), 50);
    return () => clearTimeout(t);
  }, [doc]);
  const copy =
    doc?.source === "paste"
      ? "Pasted text has no original file, so this is the only copy. You can undo for a few seconds."
      : "The original file or page is not touched. Only the reading and its progress are removed from Speak Kit.";
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={`Delete "${doc?.title ?? ""}"?`}
      width={440}
      footer={
        <>
          <Button onClick={onClose} data-default-focus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </>
      }
    >
      <p className="lib-muted">{copy}</p>
    </Modal>
  );
}
