import { useEffect, useState } from "react";
import type { Row } from "@speakkit/meetings/pure";
import { rankOutputs } from "@speakkit/meetings/pure";
import { Banner, Button, Select, SettingRow, SettingsSection } from "@speakkit/ui";
import type { Device, SettingsView } from "../../../shared/meetings/contract";
import type { MeetingsPatch } from "../../../shared/meetings/settings";
import { attempt, meetings, patchMeetings } from "./api";
import { sizeText } from "./model";
import { micChoice, recordChoice } from "./callRecordingChoices";
import { usePush, useSettingsView } from "./useMeetings";
import "./meetings.css";

interface Devices {
  inputs: Device[];
  outputs: Device[];
}

/** Outputs for the picker: the automatic choice first, then the outputs ranked (where the call app plays, the default, the rest). A virtual mixer carrying the microphone is left out. */
export function outputOptions(outputs: Device[]): { value: string; label: string }[] {
  const ranked = rankOutputs(
    outputs.map((o) => ({
      id: o.id,
      name: o.label,
      isDefault: o.isDefault,
      virtual: /virtual|cable|mixer|voicemeeter|loopback/i.test(o.label),
      callAppPlaying: false,
      carriesMic: /voicemeeter|mixer/i.test(o.label),
    })),
  );
  return [{ value: "automatic", label: "Automatic" }, ...ranked.map((o) => ({ value: o.id, label: o.isDefault ? `${o.name} (default)` : o.name }))];
}

function outputNote(v: SettingsView, outputs: Device[]): string {
  const def = outputs.find((o) => o.isDefault)?.label;
  if (v.callApp && v.capabilities.callAppOutput === "available") return `${v.callApp.name} is playing now. Speak Kit follows it if the call moves to another output.`;
  if (v.callApp) return `${v.callApp.name} is on a call. This computer does not say which output it plays on, so ${def ?? "the default output"} is recorded.`;
  return `No call app found. Speak Kit records ${def ?? "the default output"} until a call app starts, and says so.`;
}

function micNote(v: SettingsView): string {
  if (v.config.mic === "call-app" && v.capabilities.micFollowsCallApp !== "available") {
    return "This computer cannot name the call app's microphone, so the dictation microphone is used.";
  }
  return "Your voice is saved on its own track, You. The call is saved on the Them track.";
}

function Failed({ rows, reload }: { rows: Row[]; reload(): void }) {
  if (!rows.length) return null;
  return (
    <SettingsSection title="Recordings that could not be finished" description="Delete them here when you do not need them.">
      {rows.map((r) => (
        <SettingRow
          key={r.id}
          className="lm-row--control"
          label={r.title}
          description={`${r.failure?.message ?? "The recording could not be finished."} ${r.audioBytes ? sizeText(r.audioBytes) : ""}`.trim()}
          control={
            <Button variant="danger" aria-label={`Delete: ${r.title}`} onClick={() => void meetings.remove(r.id).then(reload)}>
              Delete
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );
}

function CallRows({ view, devices, patch }: { view: SettingsView; devices: Devices; patch(p: MeetingsPatch): void }) {
  const [record, mic] = [recordChoice(view), micChoice(view, devices.inputs)];
  return (
    <SettingsSection title="Call recording">
      <SettingRow
        className="lm-row--control"
        label="Record"
        description="What Speak Kit records when you record a call."
        control={
          <Select label="Record" value={record.value} options={record.options} disabled={record.options.length < 2} onChange={(recordSource) => patch({ recordSource: recordSource as "call-app" })} />
        }
      />
      <SettingRow
        className="lm-row--control"
        label="Call sound comes from"
        description={outputNote(view, devices.outputs)}
        control={
          <Select
            label="Call sound comes from"
            value={view.config.output}
            options={outputOptions(devices.outputs)}
            disabled={view.capabilities.callAppOutput === "unavailable"}
            onChange={(output) => patch({ output })}
          />
        }
      />
      <SettingRow
        className="lm-row--control"
        label="Your microphone"
        description={micNote(view)}
        control={<Select label="Your microphone" value={mic.value} options={mic.options} onChange={(mic) => patch({ mic })} />}
      />
    </SettingsSection>
  );
}

/** Settings > Voice and playback > Call recording: what is recorded, which output, which microphone; and the recordings that failed, each with Delete. */
export function CallRecordingCard() {
  const { tick } = usePush();
  const { view, set, failed } = useSettingsView(tick);
  const [devices, setDevices] = useState<Devices>({ inputs: [], outputs: [] });
  const [rows, setRows] = useState<Row[]>([]);
  const [n, setN] = useState(0);
  useEffect(() => void attempt(meetings.devices()).then((d) => d && setDevices(d)), []);
  useEffect(() => void attempt(meetings.list()).then((r) => setRows((r ?? []).filter((x) => x.status === "failed"))), [tick, n]);
  if (!view) return failed ? <Banner tone="error">The call recording settings could not be loaded.</Banner> : null;
  const patch = (p: MeetingsPatch) => void patchMeetings(p).then(set);
  return (
    <>
      <CallRows view={view} devices={devices} patch={patch} />
      <p className="tr-foot mt-foot">
        {view.capabilities.callAppOutput === "available"
          ? "Other apps, notifications and music are not recorded. Speak Kit checks where the call is playing every 2 seconds."
          : "This computer records everything it plays, because it does not say which program a sound comes from. Mute other apps during a call."}
      </p>
      <Failed rows={rows} reload={() => setN((x) => x + 1)} />
    </>
  );
}
