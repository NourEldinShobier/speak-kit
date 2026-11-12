import { useEffect, useState } from "react";
import { Banner, Button, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { NETWORK_HOSTS, NO_TELEMETRY, WHEN_LABEL } from "../../../shared/settings/network";
import { MIC_ACCESS_TEXT, type MicAccess } from "../../../shared/settings/permissions";
import { useT } from "../../i18n";
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
  const { t } = useT();
  return (
    <table className="sk-notify" data-testid="network-table">
      <thead>
        <tr>
          <th scope="col">{t("privacy.address")}</th>
          <th scope="col">{t("privacy.why")}</th>
          <th scope="col">{t("privacy.when")}</th>
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
  const { t } = useT();
  const mic = useMic();
  const blocked = mic === "denied" || mic === "restricted";
  return (
    <Page title={t("privacy.title")} lead={t("privacy.lead")}>
      <SettingsSection title={t("privacy.data")}>
        <SettingRow {...rowAttr("privacy/telemetry")} label={t("privacy.telemetry")} description={NO_TELEMETRY} control={<span>{t("privacy.telemetryOff")}</span>} />
        <SettingRow label={t("privacy.library")} description={t(s.platform === "darwin" ? "privacy.libraryMac" : "privacy.libraryWin")} />
      </SettingsSection>
      <SettingsSection title={t("privacy.permissions")}>
        <SettingRow
          {...rowAttr("privacy/microphone")}
          label={t("privacy.mic")}
          description={t("privacy.micHint")}
          control={
            <div className="sk-row-actions">
              <span data-testid="mic-status">{mic ? MIC_ACCESS_TEXT[mic] : t("privacy.checking")}</span>
              <Button onClick={() => api.openSystemSettings("microphone")}>{t(s.platform === "darwin" ? "privacy.openMac" : "privacy.openWin")}</Button>
            </div>
          }
        />
      </SettingsSection>
      {blocked && (
        <Banner tone="warning" title={t("privacy.blockedTitle")}>
          {t("privacy.blockedBody")}
        </Banner>
      )}
      <SettingsSection title={t("privacy.network")} description={t("privacy.networkHint")}>
        <div {...rowAttr("privacy/network")} className="sk-pad">
          <NetworkTable />
        </div>
      </SettingsSection>
    </Page>
  );
}
