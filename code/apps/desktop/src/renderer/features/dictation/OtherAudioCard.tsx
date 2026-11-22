import { useState } from "react";
import { Select, SettingRow, SettingsSection, Slider, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { patchDictation } from "./api";

const DUCK_OPTIONS = [
  { value: "nothing", label: "Do nothing" },
  { value: "lower", label: "Lower the volume" },
  { value: "mute", label: "Mute" },
  { value: "pause", label: "Pause playback" },
];

/** What happens to music and video while a recording runs. */
export function OtherAudioCard({ s }: { s: DictationStatus }) {
  const c = s.settings;
  const [level, setLevel] = useState(c.duckLevel);
  return (
    <SettingsSection title="Other audio">
      <SettingRow
        className="lm-row--control"
        label="While dictating"
        description="Keeps music and video out of the recording. It all comes back when the recording ends."
        control={
          <Select label="Other audio while dictating" value={c.duckAudio} onChange={(duckAudio) => void patchDictation({ duckAudio: duckAudio as typeof c.duckAudio })} options={DUCK_OPTIONS} />
        }
      />
      {c.duckAudio === "lower" && (
        <SettingRow
          className="lm-row--control"
          label="Volume while dictating"
          description={`${level}%`}
          control={<Slider min={0} max={100} step={5} value={level} aria-label="Volume while dictating" onChange={setLevel} onCommit={(duckLevel) => void patchDictation({ duckLevel })} />}
        />
      )}
      {c.duckAudio !== "nothing" && (
        <SettingRow
          label="Only for speakers"
          description="Headphones are left alone, because the microphone cannot hear them."
          control={<Toggle aria-label="Only for speakers" checked={c.duckSpeakersOnly} onChange={(duckSpeakersOnly) => void patchDictation({ duckSpeakersOnly })} />}
        />
      )}
    </SettingsSection>
  );
}
