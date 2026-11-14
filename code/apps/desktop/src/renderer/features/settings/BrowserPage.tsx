import { useState } from "react";
import { Banner, Button, SettingRow, SettingsSection, StatusPill, TextInput } from "@speakkit/ui";
import { validateChange } from "../../../shared/control/settings-registry";
import type { AppState } from "../../../shared/ipc";
import { InstallExtension } from "../../pages";
import { api, cleanError, Page } from "../../ui";
import { TokenField } from "../../TokenField";
import { changeSystem } from "../../change";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";

/** The port field with its Apply button; the message of a refused port stays under the field. */
function PortRow({ s }: { s: AppState }) {
  const { t } = useT();
  const [port, setPort] = useState(String(s.config.preferredPort));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(port);
  const check = validateChange({ port: n });
  const apply = async () => {
    setBusy(true);
    try {
      await changeSystem({ port: n });
      setErr("");
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingRow
      className="lm-row--control"
      label={t("s.browser.port")}
      description={t("s.browser.portHint")}
      control={
        <div className="sk-row-actions">
          <TextInput
            aria-label={t("s.browser.port")}
            inputMode="numeric"
            value={port}
            error={!check.ok ? t("s.browser.range") : err || undefined}
            onChange={(e) => setPort(e.target.value)}
            style={{ width: 96 }}
          />
          <Button disabled={!check.ok || busy || n === s.config.preferredPort} loading={busy} onClick={apply}>
            {t("s.browser.apply")}
          </Button>
        </div>
      }
    />
  );
}

export function BrowserPage({ s }: { s: AppState }) {
  const { t, locale } = useT();
  const lastSeen = s.pairing.lastSeenMs;
  return (
    <Page title={t("s.browser.title")} lead={t("s.browser.lead")}>
      {s.portFallback && (
        <Banner tone="warning" title={t("s.browser.portBusy", { port: String(s.config.preferredPort) })}>
          {t("s.browser.using", { port: String(s.port) })}
        </Banner>
      )}
      <SettingsSection title={t("s.browser.connection")}>
        <PortRow s={s} />
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
          <TokenField token={s.token} regenerate confirmRegenerate />
        </div>
      </SettingsSection>
    </Page>
  );
}
