import { Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { dictation } from "./api";

const DUCK_OPTIONS = [
  { value: "nothing", label: "Do nothing" },
  { value: "lower", label: "Lower the volume" },
  { value: "mute", label: "Mute" },
  { value: "pause", label: "Pause playback" },
];

/** What happens to music and video while a recording runs. */
export function OtherAudioCard({ s }: { s: DictationStatus }) {
  const c = s.settings;
  return (
    <SettingsSection title="Other audio">
      <SettingRow
        className="lm-row--control"
        label="While dictating"
        description="Keeps music and video out of the recording. It all comes back when the recording ends."
        control={<Select label="Other audio while dictating" value={c.duckAudio} onChange={(duckAudio) => void dictation.patchSettings({ duckAudio: duckAudio as typeof c.duckAudio })} options={DUCK_OPTIONS} />}
      />
      {c.duckAudio !== "nothing" && (
        <SettingRow
          label="Only for speakers"
          description="Headphones are left alone, because the microphone cannot hear them."
          control={<Toggle aria-label="Only for speakers" checked={c.duckSpeakersOnly} onChange={(duckSpeakersOnly) => void dictation.patchSettings({ duckSpeakersOnly })} />}
        />
      )}
    </SettingsSection>
  );
}
