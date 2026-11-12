import { useState, type DragEvent } from "react";
import { Banner, Button, Icon, LoadingLabel, Modal, Select } from "@speakkit/ui";
import { FORMAT_LIST, MAX_HOURS } from "@speakkit/transcripts/pure";
import type { Picked, SettingsView } from "../../../shared/transcripts/contract";
import { TRANSCRIPT_LANGUAGES } from "../../../shared/transcripts/settings";
import { attempt, transcripts } from "./api";
import { LANGUAGES, sizeText } from "./model";

type Chosen = Extract<Picked, { ok: true }>;

/** The file the person chose, or why it cannot be used. A good file clears the error; a bad one clears the file. */
function useChoice() {
  const [file, setFile] = useState<Chosen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accept = (p: Picked | null) => {
    if (!p) return;
    setFile(p.ok ? p : null);
    setError(p.ok ? null : p.failure.message);
  };
  const reset = () => {
    setFile(null);
    setError(null);
  };
  return { file, error, accept, reset };
}

/** Starts the import and says how it went: working while the file is read and decoded, failed with the reason. */
function useStart(file: Chosen | null, language: string, onDone: (id: string) => void) {
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const start = async () => {
    if (!file) return;
    setWorking(true);
    setFailed(null);
    const r = await attempt(transcripts.importFile({ path: file.path, language }));
    setWorking(false);
    if (r?.ok) onDone(r.id);
    else setFailed(r ? r.failure.message : "The file could not be imported.");
  };
  return { working, failed, start, clear: () => setFailed(null) };
}

function DropZone({ file, working, onAccept }: { file: Chosen | null; working: boolean; onAccept(p: Picked | null): void }) {
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void transcripts.checkFile(transcripts.pathOf(f)).then(onAccept);
  };
  return (
    <div className="tr-drop" data-over={over || undefined} data-testid="import-drop" onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}>
      <span className="tr-drop__tile">
        <Icon name={file ? "file-text" : "upload"} size={18} />
      </span>
      {file ? (
        <>
          <strong className="tr-drop__name">{file.name}</strong>
          <span className="tr-drop__size">{sizeText(file.bytes)}</span>
        </>
      ) : (
        <strong>Drop an audio file here</strong>
      )}
      <Button size="sm" disabled={working} onClick={() => void transcripts.pickFile().then(onAccept)}>
        {file ? "Choose another file" : "Choose file"}
      </Button>
    </div>
  );
}

function Fields({ language, setLanguage, modelName, disabled }: { language: string; setLanguage(l: string): void; modelName: string; disabled: boolean }) {
  return (
    <div className="tr-dlg__fields">
      <div className="tr-dlg__field">
        <span className="tr-dlg__label">Language</span>
        <Select label="Language" size="md" value={language} onChange={setLanguage} options={TRANSCRIPT_LANGUAGES.map((l) => ({ value: l, label: LANGUAGES[l]! }))} disabled={disabled} />
      </div>
      <div className="tr-dlg__field">
        <span className="tr-dlg__label">Model</span>
        <Select label="Model" size="md" value="current" options={[{ value: "current", label: modelName }]} disabled />
      </div>
    </div>
  );
}

const Problem = ({ text }: { text: string }) => (
  <p className="tr-dlg__error" role="alert">
    {text}
  </p>
);

interface Props {
  open: boolean;
  settings: SettingsView | null;
  onClose(): void;
  /** The import was taken in: the list shows it from here on. */
  onStarted(id: string): void;
}

/** The Import an audio file dialog: a drop zone and chooser, the language, the model dictation uses, and Import (disabled until a usable file is chosen). A file that cannot be used is named in a red line. */
export function ImportDialog({ open, settings, onClose, onStarted }: Props) {
  const choice = useChoice();
  const [language, setLanguage] = useState<string>(settings?.config.language ?? "auto");
  const close = () => {
    choice.reset();
    run.clear();
    onClose();
  };
  const run = useStart(choice.file, language, (id) => (onStarted(id), close()));
  const model = settings?.model;
  const noModel = model?.installed === false;
  return (
    <Modal
      open={open}
      onClose={run.working ? () => {} : close}
      title="Import an audio file"
      width={440}
      footer={
        <>
          <Button onClick={close} disabled={run.working} data-autofocus>
            Cancel
          </Button>
          <Button variant="primary" disabled={!choice.file || run.working || noModel} loading={run.working} onClick={() => void run.start()}>
            Import
          </Button>
        </>
      }
    >
      <p className="tr-dlg__lead">Speak Kit turns the speech in the file into text on this computer. The file is not changed and nothing is uploaded.</p>
      <DropZone file={choice.file} working={run.working} onAccept={choice.accept} />
      {choice.error ? (
        <Problem text={choice.error} />
      ) : (
        <p className="tr-dlg__hint">
          Works with {FORMAT_LIST}. Up to {MAX_HOURS} hours per file.
        </p>
      )}
      {run.failed ? <Problem text={run.failed} /> : null}
      {noModel ? <Banner tone="warning">No speech model is installed yet. Download one in Dictation, then come back.</Banner> : null}
      <Fields language={language} setLanguage={setLanguage} modelName={model?.name ?? "Speech model"} disabled={run.working} />
      {run.working ? (
        <div className="tr-dlg__working">
          <LoadingLabel>Reading the file</LoadingLabel>
        </div>
      ) : null}
    </Modal>
  );
}
