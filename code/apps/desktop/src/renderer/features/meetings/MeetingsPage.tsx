import { useState } from "react";
import { Banner, Button, Chip, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { PermissionsStatus } from "../../../shared/permissions/contract";
import type { ProviderView, SettingsView } from "../../../shared/meetings/contract";
import { AUDIO_HOURS, MEETING_TEXT_DAYS, MEETING_TRASH_DAYS, type MeetingsPatch } from "../../../shared/meetings/settings";
import { Page } from "../../ui";
import { AddAppDialog } from "./AddAppDialog";
import { meetings } from "./api";
import { sizeText } from "./model";
import { permissionName, permissionWhy, stepButton, stepStatus, usePermissions } from "./permissions";
import { ShortcutRow } from "./ShortcutRow";
import { usePush, useSettingsView } from "./useMeetings";
import "./meetings.css";

const POLICY_OPTIONS = [
  { value: "ask", label: "Ask" },
  { value: "always", label: "Always record" },
  { value: "never", label: "Never offer" },
];

const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hoursLabel = (h: number) => (h < 24 ? unit(h, "hour", "hours") : unit(h / 24, "day", "days"));
function daysLabel(n: number): string {
  if (n === 0) return "Forever";
  return n === 365 ? "1 year" : `${n} days`;
}

function Calls({ v, patch, platform }: { v: SettingsView; patch(p: MeetingsPatch): void; platform: string }) {
  const c = v.config;
  return (
    <SettingsSection title="Calls" description="Detected when an app uses your microphone and its window looks like a call.">
      <SettingRow
        label="Offer to record calls"
        description="Nothing is heard or saved until you choose Record."
        control={<Toggle aria-label="Offer to record calls" checked={c.enabled} onChange={(enabled) => patch({ enabled })} />}
      />
      <div className="mt-dim" data-off={!c.enabled || undefined}>
        <SettingRow
          label="Stop when the call ends"
          description="A prompt appears first. Keep recording if the meeting goes on."
          control={<Toggle aria-label="Stop when the call ends" checked={c.stopWhenEnds} disabled={!c.enabled} onChange={(stopWhenEnds) => patch({ stopWhenEnds })} />}
        />
        <ShortcutRow value={c.shortcut} platform={platform} disabled={!c.enabled} onChange={(shortcut) => patch({ shortcut })} />
        <SettingRow
          className="lm-row--control"
          label="Capsule position"
          description="Drag the capsule where you want it; each screen remembers its own spot."
          control={
            <Button disabled={!c.enabled || Object.keys(c.positions).length === 0} onClick={() => patch({ resetPositions: true })}>
              Reset position
            </Button>
          }
        />
      </div>
    </SettingsSection>
  );
}

function Calendar({ platform }: { platform: string }) {
  return (
    <SettingsSection title="Calendar" description="Meeting titles come from the call app and the start time.">
      <SettingRow
        label="Connect a calendar"
        description={
          platform === "darwin"
            ? "Each calendar provider needs its own sign-in. Parked until that is solved."
            : "Windows has no shared calendar source, so each provider needs its own sign-in. Parked until that is solved."
        }
        control={<Chip>Parked</Chip>}
      />
    </SettingsSection>
  );
}

function AppRow({ p, disabled, onPolicy, onRemove }: { p: ProviderView; disabled: boolean; onPolicy(v: string): void; onRemove(): void }) {
  return (
    <SettingRow
      className="lm-row--control"
      label={
        <span className="mt-app">
          <span className="tr-row__icon mt-mark" aria-hidden="true">
            {p.mark}
          </span>
          {p.name}
        </span>
      }
      description={p.hint}
      control={
        <div className="sk-row-actions">
          {p.userAdded ? (
            <Button size="sm" disabled={disabled} onClick={onRemove} aria-label={`Remove ${p.name}`}>
              Remove
            </Button>
          ) : null}
          <Select label={`What to do for ${p.name}`} value={p.policy} options={POLICY_OPTIONS} disabled={disabled} onChange={onPolicy} />
        </div>
      }
    />
  );
}

function Apps({ v, set, onAdd }: { v: SettingsView; set(v: SettingsView): void; onAdd(): void }) {
  const off = !v.config.enabled;
  return (
    <SettingsSection title="Apps" description="What to do when a call starts in each app.">
      <div className="mt-dim" data-off={off || undefined}>
        {v.providers.map((p) => (
          <AppRow key={p.id} p={p} disabled={off} onPolicy={(policy) => void meetings.setPolicy(p.id, policy as "ask").then(set)} onRemove={() => void meetings.removeApp(p.id).then(set)} />
        ))}
        <SettingRow
          className="lm-row--control"
          label="Another app"
          description="Add any app by its program or the full link of a meeting."
          control={
            <Button iconLeft="plus" disabled={off} onClick={onAdd}>
              Add app
            </Button>
          }
        />
      </div>
    </SettingsSection>
  );
}

function Notes({ v, patch }: { v: SettingsView; patch(p: MeetingsPatch): void }) {
  return (
    <SettingsSection title="Notes" description="A title, a two sentence summary and chapters for each finished transcript.">
      <SettingRow
        label="Write notes with OpenAI"
        description="Off by default. When on, the text of every finished transcript is sent to OpenAI with your key: meetings, imported audio files and dictated recordings. Audio is never sent. If it fails, you keep the transcript."
        control={<Toggle aria-label="Write notes with OpenAI" checked={v.config.summary} onChange={(summary) => patch({ summary })} />}
      />
      {v.config.summary && !v.keySaved ? (
        <div className="mt-row-note">
          <Banner tone="warning">There is no OpenAI key yet, so notes cannot be written. Add your key in the voice chat settings; meetings still get a transcript.</Banner>
        </div>
      ) : null}
    </SettingsSection>
  );
}

const hoursOptions = AUDIO_HOURS.map((h) => ({ value: String(h), label: hoursLabel(h) }));

function DaysRow({ label, value, choices, onChange }: { label: string; value: number; choices: readonly number[]; onChange(n: number): void }) {
  return (
    <SettingRow
      className="lm-row--control"
      label={label}
      control={<Select label={label} value={String(value)} options={choices.map((n) => ({ value: String(n), label: daysLabel(n) }))} onChange={(x) => onChange(Number(x))} />}
    />
  );
}

function FolderRow({ folder, set }: { folder: string; set(v: SettingsView): void }) {
  return (
    <SettingRow
      className="lm-row--control"
      label="Save files in"
      description={
        <>
          <span className="tr-path">{folder}</span>. Files never replace one that already exists.
        </>
      }
      control={
        <div className="sk-row-actions">
          <Button onClick={() => void meetings.chooseFolder().then((x) => x && set(x))}>Change</Button>
          <Button onClick={() => void meetings.openFolder()}>Open folder</Button>
        </div>
      }
    />
  );
}

function Keep({ v, patch, set }: { v: SettingsView; patch(p: MeetingsPatch): void; set(v: SettingsView): void }) {
  const c = v.config;
  return (
    <SettingsSection title="Keeping meetings" description="Audio is the large and private part, so it goes first.">
      <SettingRow
        className="lm-row--control"
        label="Delete audio after"
        description="Counted from the end of the meeting. Each meeting in the list shows when its audio goes."
        control={<Select label="Delete audio after" value={String(c.audioHours)} options={hoursOptions} onChange={(x) => patch({ audioHours: Number(x) as (typeof AUDIO_HOURS)[number] })} />}
      />
      <DaysRow label="Move transcripts to Trash after" value={c.textDays} choices={MEETING_TEXT_DAYS} onChange={(n) => patch({ textDays: n as (typeof MEETING_TEXT_DAYS)[number] })} />
      <DaysRow label="Trash keeps meetings for" value={c.trashDays} choices={MEETING_TRASH_DAYS} onChange={(n) => patch({ trashDays: n as (typeof MEETING_TRASH_DAYS)[number] })} />
      <FolderRow folder={v.folder} set={set} />
      <SettingRow label="In use now" description={`${unit(v.storage.count, "meeting", "meetings")}, ${sizeText(v.storage.audioBytes)} of audio.`} />
    </SettingsSection>
  );
}

/** What the person still has to allow before call recording works: the microphone, and on a Mac the screen permission that the call sound is taken through. */
export function MeetingPermissions({ status }: { status: PermissionsStatus | null }) {
  const guide = status?.guides.meetings;
  if (!guide) return null;
  const steps = guide.steps.filter((s) => s.state !== "not-needed");
  if (!steps.length) return null;
  return (
    <SettingsSection title="Permissions" description="What this computer must allow for recording calls.">
      {steps.map((s) => {
        const button = stepButton(s);
        return (
          <SettingRow
            key={s.id}
            className="lm-row--control"
            label={permissionName(s.id)}
            description={`${permissionWhy(s.id)} ${stepStatus(s)}.`}
            control={
              button && s.action !== "none" ? (
                <Button
                  variant={s.id === guide.next?.id ? "primary" : "secondary"}
                  aria-label={`${button} ${permissionName(s.id)}`}
                  onClick={() => void (s.action === "request" ? window.speakkitPermissions?.request(s.id) : window.speakkitPermissions?.openSettings(s.id))}
                >
                  {button}
                </Button>
              ) : (
                <Chip>Allowed</Chip>
              )
            }
          />
        );
      })}
    </SettingsSection>
  );
}

/** Settings > Meetings: the offer and stop switches, the optional shortcut, the Parked calendar card, a policy per app, notes, how long things are kept, and the permissions call recording needs. */
export function MeetingsPage({ s }: { s: AppState }) {
  const { tick } = usePush();
  const { view, set, failed } = useSettingsView(tick);
  const [adding, setAdding] = useState(false);
  const status = usePermissions();
  const lead = "Speak Kit can notice a call and offer to record it. Audio and text stay on this computer.";
  if (!view) {
    return (
      <Page title="Meetings" lead={lead}>
        {failed ? <Banner tone="error">The meeting settings could not be loaded.</Banner> : <p className="tr-foot">Loading...</p>}
      </Page>
    );
  }
  const patch = (p: MeetingsPatch) => void meetings.patchSettings(p).then(set);
  return (
    <Page title="Meetings" lead={lead}>
      {!view.config.enabled ? <Banner tone="info">Meetings are off. The Meetings tab in History is hidden and nothing is offered. Your recordings are kept.</Banner> : null}
      {view.capabilities.callDetection === "unavailable" && view.config.enabled ? (
        <Banner tone="warning">This computer does not tell Speak Kit when a call starts, so nothing is offered. You can still record with the shortcut or the tray menu.</Banner>
      ) : null}
      <Calls v={view} patch={patch} platform={s.platform} />
      <Calendar platform={s.platform} />
      <Apps v={view} set={set} onAdd={() => setAdding(true)} />
      <Notes v={view} patch={patch} />
      <Keep v={view} patch={patch} set={set} />
      <MeetingPermissions status={status} />
      <AddAppDialog open={adding} onClose={() => setAdding(false)} onAdded={() => (setAdding(false), void meetings.settings().then(set))} />
    </Page>
  );
}
