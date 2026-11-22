import { useState } from "react";
import { Banner, Button, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState, ImportOutcome } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { languageOptions } from "../../../shared/i18n";
import { importMessage } from "../../../shared/settings/import-text";
import { useT } from "../../i18n";
import { api, Page } from "../../ui";
import { Advanced } from "./Advanced";
import { change, changeSystem } from "../../change";
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
        control={<Select label={t("general.language")} value={c.language} onChange={(v) => change({ language: v as Config["language"] })} options={languageOptions(t("general.languageSystem"))} />}
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
      const r = await api.importSettings();
      if (r.status !== "cancelled") setOutcome(r); // a cancelled dialog changes nothing, so the last result stays
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
      <Advanced page="general" subtitle={t("general.fileSubtitle")} count={1}>
        <SettingsSection title={t("general.fileSection")}>
          <ImportRow />
        </SettingsSection>
      </Advanced>
    </Page>
  );
}
