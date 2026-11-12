import { Checkbox, Select, SettingRow, SettingsSection } from "@speakkit/ui";
import type { CaptureStatus } from "../../../shared/capture/contract";
import { capture } from "./api";

export function PrivacyTab({ s }: { s: CaptureStatus }) {
  const c = s.settings;
  return (
    <div className="cap-tab" data-testid="capture-privacy">
      <SettingsSection title="Hidden from recordings">
        <SettingRow
          label="Speak Kit windows"
          description="The capsule, the picker and Speak Kit itself never appear in a capture. This is always on."
          control={<Checkbox aria-label="Hide Speak Kit windows from recordings" checked disabled onChange={() => undefined} />}
        />
        <SettingRow
          label="Protected windows"
          description="Some programs, such as password managers and banking apps, block screen capture. They show black in a recording, and Speak Kit tells you so."
        />
      </SettingsSection>
      <SettingsSection title="What is recorded">
        <SettingRow label="Pictures" description="The window, area or screen you choose, as a video and a few still frames. Nothing leaves this computer." />
        <SettingRow label="Your voice" description="The microphone, only while a capture runs, turned into words on this computer." />
        <SettingRow
          className="lm-row--control"
          label="Input log"
          description="When you draw, switch the pen on or off or change what is recorded, with the time, saved next to the capture. Which keys you press and what you type is never saved, and clicks in other programs are not recorded."
          control={
            <Select
              label="Input log"
              value={c.inputLog}
              onChange={(inputLog) => void capture.patchSettings({ inputLog: inputLog as typeof c.inputLog })}
              options={[
                { value: "events", label: "Events only" },
                { value: "off", label: "Off" },
              ]}
            />
          }
        />
      </SettingsSection>
    </div>
  );
}
