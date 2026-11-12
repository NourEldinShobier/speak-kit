import { useEffect, useState } from "react";
import { Banner, Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { NETWORK_HOSTS, NO_TELEMETRY, WHEN_LABEL } from "../../../shared/settings/network";
import { MIC_ACCESS_TEXT, type MicAccess } from "../../../shared/settings/permissions";
import { api, Page } from "../../ui";
import { rowAttr } from "./focus";

/** The operating system's microphone answer, asked again when the window comes back to the front (the user may have changed it there). */
function useMic(): MicAccess | null {
  const [mic, setMic] = useState<MicAccess | null>(null);
  useEffect(() => {
    let live = true;
    const ask = () =>
      api.micAccess().then(
        (m) => live && setMic(m),
        () => live && setMic("unknown"),
      );
    void ask();
    window.addEventListener("focus", ask);
    return () => {
      live = false;
      window.removeEventListener("focus", ask);
    };
  }, []);
  return mic;
}

export function NetworkTable() {
  return (
    <table className="sk-notify" data-testid="network-table">
      <thead>
        <tr>
          <th scope="col">Address</th>
          <th scope="col">Why</th>
          <th scope="col">When</th>
        </tr>
      </thead>
      <tbody>
        {NETWORK_HOSTS.map((h) => (
          <tr key={h.host}>
            <th scope="row">{h.host}</th>
            <td>{h.why}</td>
            <td>{WHEN_LABEL[h.when]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrivacyPage({ s }: { s: AppState }) {
  const mic = useMic();
  const blocked = mic === "denied" || mic === "restricted";
  return (
    <Page title="Privacy" lead="What stays on this computer.">
      <SettingsSection title="Your data">
        <SettingRow {...rowAttr("privacy/telemetry")} label="Telemetry" description={NO_TELEMETRY} control={<span>Off, always</span>} />
        <SettingRow label="Library, audio and dictation" description={`Kept in ${s.platform === "darwin" ? "~/Library/Application Support" : "your user data folder"} and never uploaded.`} />
      </SettingsSection>
      <SettingsSection title="Permissions">
        <SettingRow
          {...rowAttr("privacy/microphone")}
          label="Microphone access"
          description="Needed for dictation and voice chat. Audio is processed on this computer."
          control={
            <div className="sk-row-actions">
              <span data-testid="mic-status">{mic ? MIC_ACCESS_TEXT[mic] : "Checking..."}</span>
              <Button onClick={() => api.openSystemSettings("microphone")}>{s.platform === "darwin" ? "Open System Settings" : "Open Windows settings"}</Button>
            </div>
          }
        />
      </SettingsSection>
      {blocked && (
        <Banner tone="warning" title="The microphone is blocked">
          Dictation and voice chat cannot hear you until you allow Speak Kit in the system settings.
        </Banner>
      )}
      <SettingsSection title="Network" description="The only addresses Speak Kit can reach.">
        <div {...rowAttr("privacy/network")} className="sk-pad">
          <NetworkTable />
        </div>
      </SettingsSection>
    </Page>
  );
}
