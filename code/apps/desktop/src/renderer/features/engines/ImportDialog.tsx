import { useState } from "react";
import { Button, Modal, Segmented, TextInput } from "@speakkit/ui";
import { models } from "./api";

type Kind = "multilingual" | "english";

interface FormProps {
  kind: Kind;
  name: string;
  error: string | null;
  setKind(k: Kind): void;
  setName(n: string): void;
}

function ImportForm({ kind, name, error, setKind, setName }: FormProps) {
  return (
    <div className="sk-import">
      <p>Speak Kit checks the file's header, copies it into its own folder and identifies it by its fingerprint. Whisper model files (.bin) work. Nothing is copied if the check fails.</p>
      <label className="sk-import__field">
        <span>Name</span>
        <TextInput aria-label="Model name" placeholder="Shown in the list" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <Segmented
        label="Languages"
        value={kind}
        onChange={(k) => setKind(k as Kind)}
        items={[
          { id: "multilingual", label: "Many languages" },
          { id: "english", label: "English only" },
        ]}
      />
      <p className="sk-import__note">Licence: check the licence of the model before you use it. Speak Kit cannot tell it from the file.</p>
      {error && (
        <p className="sk-import__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Asks the main process to open the file dialog and import the file; returns the failure message, or null when it worked or was cancelled. */
async function importChosen(kind: Kind, name: string): Promise<{ failed?: string; done: boolean }> {
  try {
    const r = await models.importFile(kind, name);
    if ("cancelled" in r) return { done: false };
    return r.ok ? { done: true } : { failed: r.message, done: false };
  } catch (e) {
    return { failed: e instanceof Error ? e.message : String(e), done: false };
  }
}

export function ImportDialog({ open, onClose, run }: { open: boolean; onClose(): void; run(f: () => Promise<unknown>): void }) {
  const [kind, setKind] = useState<Kind>("multilingual");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const choose = async () => {
    setWorking(true);
    setError(null);
    const r = await importChosen(kind, name);
    setWorking(false);
    if (r.failed) return setError(r.failed);
    if (!r.done) return;
    run(() => models.view());
    setName("");
    onClose();
  };
  const footer = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={working} onClick={() => void choose()}>
        Choose file
      </Button>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Import a model file" width={480} footer={footer}>
      <ImportForm kind={kind} name={name} error={error} setKind={setKind} setName={setName} />
    </Modal>
  );
}
