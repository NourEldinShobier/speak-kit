import { Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { languageOptions } from "../../../shared/i18n";
import { useT } from "../../i18n";
import { Page } from "../../ui";
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

export function GeneralPage({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <Page title={t("general.title")} lead={t("general.lead")}>
      <Startup s={s} />
      <Appearance c={s.config} />
    </Page>
  );
}
