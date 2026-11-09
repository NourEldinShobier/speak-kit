import { useEffect, useState } from "react";
import { Select, SettingRow, SettingsSection, Slider } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";
import { VoiceChatCard } from "./VoiceChatCard";

export function VoicePage({ s }: { s: AppState }) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const engineMissing = s.health?.engine.state === "missing";
  const token = s.token;
  useEffect(() => {
    api.voices().then(
      (v) => setVoices(v.voices),
      () => {},
    );
  }, [engineMissing, token]);
  return (
    <Page title="Voice and playback" lead="Used for previews in this app. The extension keeps its own voice and speed.">
      <SettingsSection title="Preview">
        <SettingRow
          className="lm-row--control"
          label="Voice"
          control={
            <Select
              label="Preview voice"
              value={s.config.voice}
              onChange={(v) => api.patchConfig({ voice: v })}
              options={voices.length ? voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: s.config.voice, label: s.config.voice }]}
            />
          }
        />
        <SettingRow
          label="Speed"
          description={`${s.config.speed.toFixed(2)}x`}
          control={<Slider aria-label="Preview speed" min={0.5} max={2} step={0.05} value={s.config.speed} onChange={(v) => api.patchConfig({ speed: v })} />}
        />
      </SettingsSection>
      <VoiceChatCard s={s} />
    </Page>
  );
}
