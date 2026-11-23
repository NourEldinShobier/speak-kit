import { Button, SettingRow, SettingsSection, StatusPill } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { InstallExtension } from "../../pages";
import { api, Page } from "../../ui";
import { CopyTokenButton } from "../../CopyTokenButton";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";

export function BrowserPage({ s }: { s: AppState }) {
  const { t, locale } = useT();
  const lastSeen = s.pairing.lastSeenMs;
  return (
    <Page title={t("s.browser.title")} lead={t("s.browser.lead")}>
      <SettingsSection title={t("s.browser.connection")}>
        <SettingRow
          label={t("s.browser.paired")}
          description={lastSeen ? t("s.browser.lastCall", { time: new Date(lastSeen).toLocaleTimeString(locale) }) : t("s.browser.noCall")}
          control={<StatusPill tone={lastSeen ? "green" : "neutral"}>{t(lastSeen ? "s.browser.connected" : "s.browser.waiting")}</StatusPill>}
        />
      </SettingsSection>
      <SettingsSection title={t("s.browser.install")} description={t("s.browser.installLead")}>
        <div className="sk-pad sk-row-actions">
          <Button iconLeft="external-link" onClick={() => api.openExternal("webstore")}>
            {t("s.browser.openStore")}
          </Button>
          <InstallExtension />
        </div>
      </SettingsSection>
      <SettingsSection title={t("s.browser.token")} description={t("s.browser.tokenLead")}>
        <div className="sk-pad">
          <CopyTokenButton token={s.token} />
        </div>
      </SettingsSection>
    </Page>
  );
}
