import { useState } from "react";
import { Banner, Button, Modal, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { SettingsView } from "../../../shared/transcripts/contract";
import { AUDIO_CAP_BYTES, AUDIO_DAYS, TEXT_DAYS, TRASH_DAYS, type TranscriptsPatch } from "../../../shared/transcripts/settings";
import { attempt, patchTranscripts, transcripts } from "./api";
import { sizeText } from "./model";
import { usePush, useSettingsView } from "./useTranscripts";
import "./transcripts.css";

function daysLabel(n: number): string {
  if (n === 0) return "Forever";
  if (n === 365) return "1 year";
  return `${n} ${n === 1 ? "day" : "days"}`;
}
const options = (days: readonly number[]) => days.map((n) => ({ value: String(n), label: daysLabel(n) }));

const SECTION = { title: "Transcripts", description: "Imported files and recorded conversations. Everything stays on this computer." } as const;

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

/** A retention row: a label, what it does, and a menu of day counts. */
function DaysRow({
  label,
  description,
  value,
  days,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  days: readonly number[];
  disabled?: boolean;
  onChange(n: number): void;
}) {
  return (
    <SettingRow
      className="lm-row--control"
      label={label}
      description={description}
      control={<Select label={label} value={String(value)} options={options(days)} disabled={disabled ?? false} onChange={(v) => onChange(Number(v))} />}
    />
  );
}

function Retention({ view, patch }: { view: SettingsView; patch(p: TranscriptsPatch): void }) {
  const c = view.config;
  const audioNote = c.textDays !== 0 && c.audioDays > c.textDays ? "Never longer than transcripts are kept." : "Shorter than transcripts, because audio is the large and private part.";
  return (
    <>
      <DaysRow label="Keep transcripts for" description="Older transcripts move to Trash." value={c.textDays} days={TEXT_DAYS} onChange={(n) => patch({ textDays: n as (typeof TEXT_DAYS)[number] })} />
      <SettingRow
        label="Keep audio of recorded conversations"
        description="Imported files are never copied. Turn this off to delete the audio as soon as the transcript is done."
        control={<Toggle aria-label="Keep audio of recorded conversations" checked={c.keepAudio} onChange={(keepAudio) => patch({ keepAudio })} />}
      />
      <DaysRow label="Keep audio for" description={audioNote} value={c.audioDays} days={AUDIO_DAYS} disabled={!c.keepAudio} onChange={(n) => patch({ audioDays: n as (typeof AUDIO_DAYS)[number] })} />
      <DaysRow
        label="Trash keeps deleted transcripts for"
        description="You can restore them until then. Delete now in Trash removes them sooner."
        value={c.trashDays}
        days={TRASH_DAYS}
        onChange={(n) => patch({ trashDays: n as (typeof TRASH_DAYS)[number] })}
      />
    </>
  );
}

function Where({ view, set }: { view: SettingsView; set(v: SettingsView): void }) {
  return (
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
  );
}

function InUse({ view, onDeleteAudio }: { view: SettingsView; onDeleteAudio(): void }) {
  const s = view.storage;
  return (
    <>
      <SettingRow
        className="lm-row--control"
        label="In use now"
        description={`${s.count} ${s.count === 1 ? "transcript" : "transcripts"}, ${sizeText(s.audioBytes)} of audio (the oldest goes first above ${sizeText(AUDIO_CAP_BYTES)}), ${s.trashed} in Trash.`}
        control={
          <Button variant="danger" disabled={s.audioBytes === 0} onClick={onDeleteAudio}>
            Delete all audio
          </Button>
        }
      />
      <SettingRow label="Speech model" description={view.model.installed ? `${view.model.name}. Changed in Dictation settings.` : `${view.model.name} is not installed. Download it in Dictation.`} />
      <SettingRow label="Dictation goes first" description="While you dictate, a transcript in progress waits for the speech engine and carries on afterwards." />
    </>
  );
}

/** Settings > Storage > Transcripts: how long transcripts and audio are kept, the Trash period, where exports go, what is in use, and the model that is used. */
export function TranscriptSettings() {
  const { tick } = usePush();
  const { view, set, failed } = useSettingsView(tick);
  const [asking, setAsking] = useState(false);
  if (!view) {
    return <SettingsSection {...SECTION}>{failed ? <Banner tone="error">The transcript settings could not be loaded.</Banner> : <SettingRow label="Loading..." />}</SettingsSection>;
  }
  return (
    <>
      <SettingsSection {...SECTION}>
        <Retention view={view} patch={(p) => void attempt(patchTranscripts(p)).then((r) => r && set(r))} />
        <Where view={view} set={set} />
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
