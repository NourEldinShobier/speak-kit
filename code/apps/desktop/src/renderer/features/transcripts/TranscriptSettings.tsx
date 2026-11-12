import { useState } from "react";
import { Banner, Button, Modal, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import { AUDIO_DAYS, TEXT_DAYS, TRASH_DAYS, type TranscriptsPatch } from "../../../shared/transcripts/settings";
import { transcripts } from "./api";
import { sizeText } from "./model";
import { usePush, useSettingsView } from "./useTranscripts";
import "./transcripts.css";

const daysLabel = (n: number) => (n === 0 ? "Forever" : n === 365 ? "1 year" : `${n} ${n === 1 ? "day" : "days"}`);
const options = (days: readonly number[]) => days.map((n) => ({ value: String(n), label: daysLabel(n) }));

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
        The audio of every recorded conversation is deleted from this computer. The transcripts stay. You cannot undo it.
      </p>
    </Modal>
  );
}

/** Settings > Storage > Transcripts: how long transcripts and audio are kept, the Trash period, where exports go, what is in use, and the model that is used. */
export function TranscriptSettings() {
  const { tick } = usePush();
  const { view, set, failed } = useSettingsView(tick);
  const [asking, setAsking] = useState(false);
  if (failed && !view) {
    return (
      <SettingsSection title="Transcripts" description="Imported files and recorded conversations.">
        <Banner tone="error">The transcript settings could not be loaded.</Banner>
      </SettingsSection>
    );
  }
  if (!view) {
    return (
      <SettingsSection title="Transcripts" description="Imported files and recorded conversations.">
        <SettingRow label="Loading..." />
      </SettingsSection>
    );
  }
  const c = view.config;
  const patch = (p: TranscriptsPatch) => void transcripts.patchSettings(p).then(set);
  const s = view.storage;
  return (
    <>
      <SettingsSection title="Transcripts" description="Imported files and recorded conversations. Everything stays on this computer.">
        <SettingRow
          className="lm-row--control"
          label="Keep transcripts for"
          description="Older transcripts move to Trash."
          control={<Select label="Keep transcripts for" value={String(c.textDays)} options={options(TEXT_DAYS)} onChange={(v) => patch({ textDays: Number(v) as (typeof TEXT_DAYS)[number] })} />}
        />
        <SettingRow
          label="Keep audio of recorded conversations"
          description="Imported files are never copied. Turn this off to delete the audio as soon as the transcript is done."
          control={<Toggle aria-label="Keep audio of recorded conversations" checked={c.keepAudio} onChange={(keepAudio) => patch({ keepAudio })} />}
        />
        <SettingRow
          className="lm-row--control"
          label="Keep audio for"
          description={c.textDays !== 0 && c.audioDays > c.textDays ? "Never longer than transcripts are kept." : "Shorter than transcripts, because audio is the large and private part."}
          control={
            <Select
              label="Keep audio for"
              value={String(c.audioDays)}
              options={options(AUDIO_DAYS)}
              disabled={!c.keepAudio}
              onChange={(v) => patch({ audioDays: Number(v) as (typeof AUDIO_DAYS)[number] })}
            />
          }
        />
        <SettingRow
          className="lm-row--control"
          label="Trash keeps deleted transcripts for"
          description="You can restore them until then. Delete now in Trash removes them sooner."
          control={
            <Select
              label="Trash keeps deleted transcripts for"
              value={String(c.trashDays)}
              options={options(TRASH_DAYS)}
              onChange={(v) => patch({ trashDays: Number(v) as (typeof TRASH_DAYS)[number] })}
            />
          }
        />
        <SettingRow
          className="lm-row--control"
          label="Save transcripts in"
          description={
            <>
              <span className="tr-path">{view.folder}</span>. Exports go here and never replace a file that already exists.
            </>
          }
          control={
            <div className="sk-row-actions">
              <Button onClick={() => void transcripts.chooseFolder().then((v) => v && set(v))}>Change</Button>
              <Button onClick={() => void transcripts.openFolder()}>Open folder</Button>
            </div>
          }
        />
        <SettingRow
          className="lm-row--control"
          label="In use now"
          description={`${s.count} ${s.count === 1 ? "transcript" : "transcripts"}, ${sizeText(s.audioBytes)} of audio, ${s.trashed} in Trash.`}
          control={
            <Button variant="danger" disabled={s.audioBytes === 0} onClick={() => setAsking(true)}>
              Delete all audio
            </Button>
          }
        />
        <SettingRow label="Speech model" description={view.model.installed ? `${view.model.name}. Changed in Dictation settings.` : `${view.model.name} is not installed. Download it in Dictation.`} />
        <SettingRow label="Dictation goes first" description="While you dictate, a transcript in progress waits for the speech engine and carries on afterwards." />
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
