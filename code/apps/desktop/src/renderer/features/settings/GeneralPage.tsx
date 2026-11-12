import { useState } from "react";
import { Banner, Button, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState, ImportOutcome } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { closeHint, effectiveCloseAction } from "../../../shared/settings/behaviour";
import { importMessage } from "../../../shared/settings/import-text";
import { useT } from "../../i18n";
import { api, Page } from "../../ui";
import { Advanced } from "./Advanced";
import { change, changeSystem } from "./change";
import { rowAttr } from "./focus";

function Startup({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <SettingsSection title={t("general.startup")}>
      <SettingRow
        {...rowAttr("general/launch")}
        label={t("general.launch")}
        description={t("general.launchHint")}
        control={<Toggle aria-label={t("general.launch")} checked={s.launchAtLogin} onChange={(v) => changeSystem({ launchAtLogin: v })} />}
      />
      <SettingRow
        {...rowAttr("general/minimized")}
        label={t("general.minimized")}
        description={t("general.minimizedHint")}
        control={<Toggle aria-label={t("general.minimized")} checked={s.config.startMinimized} onChange={(v) => change({ startMinimized: v })} />}
      />
    </SettingsSection>
  );
}

function Appearance({ c }: { c: Config }) {
  const { t } = useT();
  return (
    <SettingsSection title={t("general.appearance")}>
      <SettingRow
        {...rowAttr("general/language")}
        className="lm-row--control"
        label={t("general.language")}
        description={t("general.languageHint")}
        control={
          <Select
            label={t("general.language")}
            value={c.language}
            onChange={(v) => change({ language: v as Config["language"] })}
            options={[
              { value: "system", label: t("general.languageSystem") },
              { value: "en", label: "English" },
              { value: "es", label: "Español" },
            ]}
          />
        }
      />
    </SettingsSection>
  );
}

function Tray({ s }: { s: AppState }) {
  const { t } = useT();
  const c = s.config;
  return (
    <SettingsSection title={t("general.tray")}>
      <SettingRow
        {...rowAttr("general/close")}
        className="lm-row--control"
        label={t("general.close")}
        description={t(closeHint(c))}
        control={
          <Select
            label={t("general.close")}
            value={effectiveCloseAction(c)}
            disabled={c.hideTrayIcon}
            onChange={(v) => change({ closeAction: v as Config["closeAction"] })}
            options={[
              { value: "hide", label: t("general.closeKeeps") },
              { value: "quit", label: t("general.closeQuits") },
            ]}
          />
        }
      />
      <SettingRow
        {...rowAttr("general/tray")}
        label={t("general.showTray")}
        description={s.platform === "darwin" ? t("general.trayMac") : t("general.trayWin")}
        control={<Toggle aria-label={t("general.showTray")} checked={!c.hideTrayIcon} onChange={(v) => change({ hideTrayIcon: !v })} />}
      />
    </SettingsSection>
  );
}

/** The row that imports a settings file, and what the import did. */
function ImportRow() {
  const { t, locale } = useT();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      setOutcome(await api.importSettings());
    } catch (e) {
      setOutcome({ status: "failed", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SettingRow
        {...rowAttr("general/import")}
        label={t("general.import")}
        description={t("general.importHint")}
        control={
          <Button onClick={() => void run()} disabled={busy}>
            {t("general.importButton")}
          </Button>
        }
      />
      {outcome?.status === "imported" && <Banner role="status">{importMessage(locale, outcome)}</Banner>}
      {outcome?.status === "failed" && <Banner tone="error">{t("general.importFailed", { message: outcome.message })}</Banner>}
    </>
  );
}

export function GeneralPage({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <Page title={t("general.title")} lead={t("general.lead")}>
      <Startup s={s} />
      <Appearance c={s.config} />
      <Tray s={s} />
      <Advanced page="general" subtitle={t("general.fileSubtitle")} count={3}>
        <SettingsSection title={t("general.fileSection")}>
          <SettingRow
            {...rowAttr("general/settings-file")}
            label={t("general.file")}
            description={t("general.fileHint")}
            control={<Button onClick={() => api.openPath("data")}>{t("general.showFolder")}</Button>}
          />
          <ImportRow />
          <SettingRow
            {...rowAttr("general/setup-again")}
            label={t("general.setup")}
            description={t("general.setupHint")}
            control={<Button onClick={() => change({ setupDone: false })}>{t("general.setupButton")}</Button>}
          />
        </SettingsSection>
      </Advanced>
    </Page>
  );
}
