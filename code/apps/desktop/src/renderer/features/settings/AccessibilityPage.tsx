import { Kbd, SettingRow, SettingsSection } from "@speakkit/ui";
import { KEYBOARD_MAP } from "../../../shared/settings/behaviour";
import { Page } from "../../ui";
import { rowAttr } from "./focus";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";

export function AccessibilityPage() {
  const { t, label } = useT();
  return (
    <Page title={t("s.a11y.title")} lead={t("s.a11y.lead")}>
      <SettingsSection title={t("s.a11y.map")} description={t("s.a11y.mapLead")}>
        <div {...rowAttr("accessibility/keys")}>
          {KEYBOARD_MAP.map((k, i) => (
            <SettingRow key={k.keys} label={label(`s.a11y.does.${i}`, k.does)} control={<Kbd>{label(`s.a11y.keys.${i}`, k.keys)}</Kbd>} />
          ))}
        </div>
      </SettingsSection>
      <p className="sk-note">{t("s.a11y.note")}</p>
    </Page>
  );
}
