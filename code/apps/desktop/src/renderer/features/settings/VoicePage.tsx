import { useEffect, useState } from "react";
import { Select, SettingRow, SettingsSection, Slider } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { useT } from "../../i18n";
import { api, Page } from "../../ui";
import { change } from "./change";
import { CallRecordingCard } from "../meetings";

export function VoicePage({ s }: { s: AppState }) {
  const { t } = useT();
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
    <Page title={t("voice.title")} lead={t("voice.lead")}>
      <SettingsSection title={t("voice.preview")}>
        <SettingRow
          className="lm-row--control"
          label={t("voice.voice")}
          control={
            <Select
              label={t("voice.previewVoice")}
              value={s.config.voice}
              onChange={(v) => change({ voice: v })}
              options={voices.length ? voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: s.config.voice, label: s.config.voice }]}
            />
          }
        />
        <SettingRow
          label={t("voice.speed")}
          description={`${s.config.speed.toFixed(2)}x`}
          control={<Slider aria-label={t("voice.previewSpeed")} min={0.5} max={2} step={0.05} value={s.config.speed} onChange={(v) => change({ speed: v })} />}
        />
      </SettingsSection>
      <CallRecordingCard />
    </Page>
  );
}
