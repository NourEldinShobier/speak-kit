import { useEffect, useState } from "react";
import { Banner, Button, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { api, usePreview } from "../../ui";
import { Back, Foot, Frame } from "./Frame";

const SAMPLE = "Notes, documents and even voices lived on someone else's server, rented back to us by the month.";

function HandyToKnow({ s }: { s: AppState }) {
  return (
    <SettingsSection title="Handy to know">
      <SettingRow
        label="Tray icon"
        description="Speak Kit lives in the system tray. Windows 11 may hide it under the arrow; drag the icon out to keep it in view. Closing the window keeps it running."
      />
      <SettingRow
        label="Launch at login"
        description="Start Speak Kit when you sign in to Windows."
        control={<Toggle aria-label="Launch at login" checked={s.launchAtLogin} onChange={(v) => api.setLaunchAtLogin(v)} />}
      />
      <SettingRow
        label="Start in the tray"
        description="When it starts at sign-in, stay in the tray instead of opening a window."
        control={<Toggle aria-label="Start in the tray" checked={s.config.startMinimized} onChange={(v) => api.patchConfig({ startMinimized: v })} />}
      />
    </SettingsSection>
  );
}

export function DoneStep({ s, skipped, onBack }: { s: AppState; skipped: boolean; onBack(): void }) {
  const [voice, setVoice] = useState("");
  const { playing, error, toggle } = usePreview();
  const engineState = s.health?.engine.state;
  useEffect(() => {
    api.voices().then(
      (v) => setVoice(v.default),
      () => {},
    );
  }, [engineState]);
  const on = playing === voice && !!voice;
  const open = () => api.patchConfig({ setupDone: true, setupSkipped: skipped });
  return (
    <Frame
      at={3}
      title={skipped ? "Setup is finished" : "You're all set"}
      sub={skipped ? "You can connect the browser extension later from Browser." : "Kokoro is ready. Press play to hear your voice."}
      foot={
        <Foot back={<Back onClick={onBack} />}>
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={() => void open()}>
            Open Speak Kit
          </Button>
        </Foot>
      }
    >
      <Banner tone="info" icon={skipped ? "info-circle" : "circle-check"} title={skipped ? "Browser extension not connected" : "Server is running"}>
        {skipped ? "Pair it later under Browser." : `Listening on 127.0.0.1:${s.port}`}
      </Banner>
      <SettingsSection title="Hear it">
        <SettingRow
          label="Play sample"
          description={`“${SAMPLE}”`}
          control={
            <Button variant="primary" iconLeft={on ? "player-stop" : "player-play"} disabled={!voice} aria-label={on ? "Stop sample" : "Play sample"} onClick={() => toggle(voice, SAMPLE)}>
              {on ? "Stop" : "Play"}
            </Button>
          }
        />
      </SettingsSection>
      {error && <Banner tone="error">{error}</Banner>}
      <HandyToKnow s={s} />
    </Frame>
  );
}
