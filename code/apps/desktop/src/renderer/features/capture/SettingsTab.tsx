import { useState } from "react";
import { Button, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { CaptureStatus } from "../../../shared/capture/contract";
import { AUTO_SEND, INK_FADE_MS, RETENTION_DAYS, TARGET_KINDS } from "../../../shared/capture/settings";
import { HotkeyRecorder } from "../dictation";
import { capture } from "./api";
import { INK_LABEL, RETENTION_LABEL } from "./format";

const WHERE: Record<(typeof TARGET_KINDS)[number], string> = { ask: "Ask each time", screen: "Whole screen", window: "A window", area: "An area" };
const opts = <T extends string | number>(values: readonly T[], label: (v: T) => string) => values.map((v) => ({ value: String(v), label: label(v) }));

function General({ s }: { s: CaptureStatus }) {
  const [recording, setRecording] = useState(false);
  const c = s.settings;
  return (
    <SettingsSection title="General">
      <SettingRow
        label="Capture"
        description="Turn on to use the capture hotkey in any app."
        control={<Toggle aria-label="Capture" checked={c.enabled} disabled={!s.supported} onChange={(on) => void capture.setEnabled(on)} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Hotkey"
        description={
          recording
            ? "Press the keys you want to use. Esc cancels."
            : "Tap to start or stop. Hold to draw with the mouse. A hotkey with modifier keys starts when you let go, and Esc before that records nothing."
        }
        control={<HotkeyRecorder label="Capture hotkey" value={c.hotkey} restore="F9" onRecording={setRecording} save={async (hotkey) => void (await capture.patchSettings({ hotkey }))} />}
      />
      {s.hotkeyNote ? (
        <p className="cap-note" role="alert">
          {s.hotkeyNote} <Button onClick={() => void capture.patchSettings({ hotkey: "F9" })}>Restore F9</Button>
        </p>
      ) : null}
      <SettingRow
        className="lm-row--control"
        label="Where to record"
        description="Speak Kit remembers your last choice for each screen."
        control={
          <Select label="Where to record" value={c.target} onChange={(target) => void capture.patchSettings({ target: target as typeof c.target })} options={opts(TARGET_KINDS, (k) => WHERE[k])} />
        }
      />
      <SettingRow
        label="Talk while you record"
        description="Uses the dictation microphone and speech model. Quiet speech is kept, and a silent microphone is reopened. Nothing is sent anywhere."
        control={<Toggle aria-label="Talk while you record" checked={c.narration} onChange={(narration) => void capture.patchSettings({ narration })} />}
      />
    </SettingsSection>
  );
}

function Recording({ s }: { s: CaptureStatus }) {
  const c = s.settings;
  return (
    <SettingsSection title="While recording">
      <SettingRow
        className="lm-row--control"
        label="Other audio"
        description="Follows your While dictating choice, so music and videos stay out of the narration."
        control={
          <Select
            label="Other audio"
            value={c.otherAudio}
            onChange={(otherAudio) => void capture.patchSettings({ otherAudio: otherAudio as typeof c.otherAudio })}
            options={[
              { value: "mute", label: "Mute" },
              { value: "keep", label: "Keep playing" },
            ]}
          />
        }
      />
      <SettingRow
        label="Pointer trail"
        description="Hold Shift while recording and a glowing trail follows the pointer. Shift alone draws ink. If Windows offers Sticky Keys after five Shift presses, choose No."
        control={<Toggle aria-label="Pointer trail" checked={c.pointerTrail} onChange={(pointerTrail) => void capture.patchSettings({ pointerTrail })} />}
      />
      <SettingRow
        className="lm-row--control"
        label="Ink fades after"
        description="How long a drawn line stays on the screen."
        control={
          <Select
            label="Ink fades after"
            value={String(c.inkFadeMs)}
            onChange={(v) => void capture.patchSettings({ inkFadeMs: Number(v) as (typeof INK_FADE_MS)[number] })}
            options={opts(INK_FADE_MS, (v) => INK_LABEL[v]!)}
          />
        }
      />
    </SettingsSection>
  );
}

function Saving({ s }: { s: CaptureStatus }) {
  const c = s.settings;
  const bin = s.platform === "darwin" ? "Trash" : "Recycle Bin";
  return (
    <SettingsSection title="Saving">
      <SettingRow className="lm-row--control" label="Save captures in" description={s.folder} control={<Button onClick={() => void capture.chooseFolder()}>Choose folder</Button>} />
      <SettingRow
        className="lm-row--control"
        label="Send to Voice chat"
        description="After a recording is saved, the capsule counts down and then lets Voice chat read it. Hold or Undo until it is read."
        control={
          <Select
            label="Send to Voice chat"
            value={c.autoSend}
            onChange={(autoSend) => void capture.patchSettings({ autoSend: autoSend as (typeof AUTO_SEND)[number] })}
            options={opts(AUTO_SEND, (a) => (a === "off" ? "Off" : `After ${a.replace("s", " seconds")}`))}
          />
        }
      />
      <SettingRow
        className="lm-row--control"
        label="Keep captures"
        description={`Older captures move to the ${bin}.`}
        control={
          <Select
            label="Keep captures"
            value={String(c.retentionDays)}
            onChange={(v) => void capture.patchSettings({ retentionDays: Number(v) as (typeof RETENTION_DAYS)[number] })}
            options={opts(RETENTION_DAYS, (v) => RETENTION_LABEL[v]!)}
          />
        }
      />
    </SettingsSection>
  );
}

export function SettingsTab({ s }: { s: CaptureStatus }) {
  return (
    <div className="cap-tab" data-testid="capture-settings">
      <General s={s} />
      <Recording s={s} />
      <Saving s={s} />
    </div>
  );
}
