import { useState, type DragEvent } from "react";
import { Banner, Button, Icon, LoadingLabel, Modal, Select } from "@speakkit/ui";
import { FORMAT_LIST, MAX_HOURS } from "@speakkit/transcripts/pure";
import type { Picked, SettingsView } from "../../../shared/transcripts/contract";
import { TRANSCRIPT_LANGUAGES } from "../../../shared/transcripts/settings";
import { transcripts } from "./api";
import { sizeText } from "./model";

const LANGUAGES: Record<string, string> = { auto: "Auto-detect", en: "English", de: "German", ar: "Arabic" };

interface Props {
  open: boolean;
  settings: SettingsView | null;
  onClose(): void;
  /** The import was taken in: the list shows it from here on. */
  onStarted(id: string): void;
}

type Stage = { kind: "choose" } | { kind: "working" } | { kind: "failed"; message: string };

/** The Import an audio file dialog: a drop zone and chooser, the language, the model dictation uses, and Import (disabled until a usable file is chosen). A file that cannot be used is named in a red line. */
export function ImportDialog({ open, settings, onClose, onStarted }: Props) {
  const [file, setFile] = useState<Extract<Picked, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(settings?.config.language ?? "auto");
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [over, setOver] = useState(false);
  const accept = (p: Picked | null) => {
    if (!p) return;
    setStage({ kind: "choose" });
    if (p.ok) (setFile(p), setError(null));
    else (setFile(null), setError(p.failure.message));
  };
  const close = () => {
    setFile(null);
    setError(null);
    setStage({ kind: "choose" });
    onClose();
  };
  const start = async () => {
    if (!file) return;
    setStage({ kind: "working" });
    const r = await transcripts.importFile({ path: file.path, language }).catch(() => null);
    if (r?.ok) {
      onStarted(r.id);
      close();
    } else {
      setStage({ kind: "failed", message: r ? r.failure.message : "The file could not be imported." });
    }
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void transcripts.checkFile(transcripts.pathOf(f)).then(accept);
  };
  const working = stage.kind === "working";
  const model = settings?.model;
  return (
    <Modal
      open={open}
      onClose={working ? () => {} : close}
      title="Import an audio file"
      width={440}
      footer={
        <>
          <Button onClick={close} disabled={working} data-autofocus>
            Cancel
          </Button>
          <Button variant="primary" disabled={!file || working || model?.installed === false} loading={working} onClick={() => void start()}>
            Import
          </Button>
        </>
      }
    >
      <p className="tr-dlg__lead">Speak Kit turns the speech in the file into text on this computer. The file is not changed and nothing is uploaded.</p>
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
        <Button size="sm" disabled={working} onClick={() => void transcripts.pickFile().then(accept)}>
          {file ? "Choose another file" : "Choose file"}
        </Button>
      </div>
      {error ? (
        <p className="tr-dlg__error" role="alert">
          {error}
        </p>
      ) : (
        <p className="tr-dlg__hint">
          Works with {FORMAT_LIST}. Up to {MAX_HOURS} hours per file.
        </p>
      )}
      {stage.kind === "failed" ? (
        <p className="tr-dlg__error" role="alert">
          {stage.message}
        </p>
      ) : null}
      {model && !model.installed ? <Banner tone="warning">No speech model is installed yet. Download one in Dictation, then come back.</Banner> : null}
      <div className="tr-dlg__fields">
        <div className="tr-dlg__field">
          <span className="tr-dlg__label" id="tr-lang">
            Language
          </span>
          <Select label="Language" size="md" value={language} onChange={setLanguage} options={TRANSCRIPT_LANGUAGES.map((l) => ({ value: l, label: LANGUAGES[l]! }))} disabled={working} />
        </div>
        <div className="tr-dlg__field">
          <span className="tr-dlg__label" id="tr-model">
            Model
          </span>
          <Select label="Model" size="md" value="current" options={[{ value: "current", label: model?.name ?? "Speech model" }]} disabled />
        </div>
      </div>
      {working ? (
        <div className="tr-dlg__working">
          <LoadingLabel>Reading the file</LoadingLabel>
        </div>
      ) : null}
    </Modal>
  );
}
