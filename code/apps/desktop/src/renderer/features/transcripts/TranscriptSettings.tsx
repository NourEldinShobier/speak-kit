import { useState } from "react";
import { Banner, Button, Modal, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { SettingsView } from "../../../shared/transcripts/contract";
import type { TranscriptsPatch } from "../../../shared/transcripts/settings";
import { attempt, patchTranscripts, transcripts } from "./api";
import { sizeText } from "./model";
import { usePush, useSettingsView } from "./useTranscripts";
import "./transcripts.css";

const SECTION = { title: "Transcripts", description: "Imported audio files. Everything stays on this computer." } as const;

function DeleteAudioDialog({ open, onClose, onConfirm }: { open: boolean; onClose(): void; onConfirm(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete all audio?"
      width={400}
      footer={
        <>
          <Button onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete all audio
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        The audio kept for imports that did not finish is deleted from this computer. The transcripts stay. You cannot undo it.
      </p>
    </Modal>
  );
}

function NotesSwitch({ view, patch }: { view: SettingsView; patch(p: TranscriptsPatch): void }) {
  return (
    <SettingRow
      label="Write notes with OpenAI"
      description="A title, a two sentence summary and chapters for each finished transcript. Off by default. When on, the text of every finished transcript is sent to OpenAI with your key. Audio is never sent. If it fails, you keep the transcript."
      control={<Toggle aria-label="Write notes with OpenAI" checked={view.config.notes} onChange={(notes) => patch({ notes })} />}
    />
  );
}

function InUse({ view, onDeleteAudio }: { view: SettingsView; onDeleteAudio(): void }) {
  const s = view.storage;
  return (
    <>
      <SettingRow
        className="lm-row--control"
        label="In use now"
        description={`${s.count} ${s.count === 1 ? "transcript" : "transcripts"}, ${sizeText(s.audioBytes)} of audio.`}
        control={
          <Button variant="danger" disabled={s.audioBytes === 0} onClick={onDeleteAudio}>
            Delete all audio
          </Button>
        }
      />
    </>
  );
}

/** Settings > Storage > Transcripts: whether notes are written, and what is in use. */
export function TranscriptSettings() {
  const { tick } = usePush();
  const { view, set, failed } = useSettingsView(tick);
  const [asking, setAsking] = useState(false);
  const save = (p: TranscriptsPatch) => void attempt(patchTranscripts(p)).then((r) => r && set(r));
  if (!view) {
    return <SettingsSection {...SECTION}>{failed ? <Banner tone="error">The transcript settings could not be loaded.</Banner> : <SettingRow label="Loading..." />}</SettingsSection>;
  }
  return (
    <>
      <SettingsSection {...SECTION}>
        <NotesSwitch view={view} patch={save} />
        <InUse view={view} onDeleteAudio={() => setAsking(true)} />
      </SettingsSection>
      <DeleteAudioDialog
        open={asking}
        onClose={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          void transcripts.deleteAllAudio().then(() => transcripts.settings().then(set));
        }}
      />
    </>
  );
}
