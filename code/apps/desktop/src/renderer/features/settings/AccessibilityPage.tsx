import { Kbd, Segmented, SettingRow, SettingsSection } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { KEYBOARD_MAP } from "../../../shared/settings/behaviour";
import { Page } from "../../ui";
import { rowAttr } from "./focus";
import { change } from "./change";

const MOTION = [
  { id: "system", label: "System" },
  { id: "on", label: "Reduce" },
  { id: "off", label: "Full" },
];

export function AccessibilityPage({ s }: { s: AppState }) {
  const c = s.config;
  return (
    <Page title="Accessibility" lead="Make Speak Kit easier to see and hear.">
      <SettingsSection title="Motion">
        <SettingRow
          {...rowAttr("accessibility/motion")}
          className="lm-row--control"
          label="Reduce motion"
          description="Still frames and short fades instead of movement. System follows the operating system."
          control={<Segmented label="Reduce motion" items={MOTION} value={c.reduceMotion} onChange={(v) => change({ reduceMotion: v as Config["reduceMotion"] })} />}
        />
      </SettingsSection>
      <SettingsSection title="Keyboard map" description="Everything in Speak Kit can be reached without a mouse. Global keys are on the Shortcuts page.">
        <div {...rowAttr("accessibility/keys")}>
          {KEYBOARD_MAP.map((k) => (
            <SettingRow key={k.keys} label={k.does} control={<Kbd>{k.keys}</Kbd>} />
          ))}
        </div>
      </SettingsSection>
      <p className="sk-note">
        Not covered yet: no full session with a screen reader has been run on Windows or macOS. The dictation pill is a polite live region and says Recording, Transcribing or Failed. Report what does
        not read well.
      </p>
    </Page>
  );
}
