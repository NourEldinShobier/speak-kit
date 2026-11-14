import { Kbd, Segmented, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { KEYBOARD_MAP } from "../../../shared/settings/behaviour";
import { Page } from "../../ui";
import { rowAttr } from "./focus";
import { change } from "../../change";
import "../../../shared/i18n/packs/settings";
import { useT } from "../../i18n";

const MOTION = [
  { id: "system", label: "s.a11y.system" },
  { id: "on", label: "s.a11y.reduceOn" },
  { id: "off", label: "s.a11y.full" },
] as const;

export function AccessibilityPage({ s }: { s: AppState }) {
  const { t, label } = useT();
  const c = s.config;
  return (
    <Page title={t("s.a11y.title")} lead={t("s.a11y.lead")}>
      <SettingsSection title={t("s.a11y.motion")}>
        <SettingRow
          {...rowAttr("accessibility/motion")}
          className="lm-row--control"
          label={t("s.a11y.reduce")}
          description={t("s.a11y.reduceHint")}
          control={
            <Segmented
              label={t("s.a11y.reduce")}
              items={MOTION.map((m) => ({ id: m.id, label: t(m.label) }))}
              value={c.reduceMotion}
              onChange={(v) => change({ reduceMotion: v as Config["reduceMotion"] })}
            />
          }
        />
      </SettingsSection>
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
