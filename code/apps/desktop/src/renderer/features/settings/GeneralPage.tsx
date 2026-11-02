import { Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";

function Startup({ s }: { s: AppState }) {
  return (
    <SettingsSection title="Startup">
      <SettingRow
        label="Launch at login"
        description="Start Speak Kit when you sign in so the extension is ready."
        control={<Toggle aria-label="Launch at login" checked={s.launchAtLogin} onChange={(v) => api.setLaunchAtLogin(v)} />}
      />
      <SettingRow
        label="Start minimized to tray"
        description="When it starts at login, stay in the tray instead of opening a window."
        control={<Toggle aria-label="Start minimized to tray" checked={s.config.startMinimized} onChange={(v) => api.patchConfig({ startMinimized: v })} />}
      />
    </SettingsSection>
  );
}

function Appearance({ s }: { s: AppState }) {
  const c = s.config;
  return (
    <SettingsSection title="Appearance">
      <SettingRow
        label="Language"
        control={
          <Select
            label="Language"
            value={c.language}
            onChange={(v) => api.patchConfig({ language: v as "system" | "en" })}
            options={[
              { value: "system", label: "System default" },
              { value: "en", label: "English" },
            ]}
          />
        }
      />
    </SettingsSection>
  );
}

/** Where the system shows notifications: Windows names them toasts, macOS banners. */
const clipboardNote = (platform: string) =>
  `Shows a ${platform === "darwin" ? "macOS" : "Windows"} notification after you copy a few sentences. Copies from password managers are skipped. The text never leaves this computer.`;

export function GeneralPage({ s }: { s: AppState }) {
  return (
    <Page title="General" lead="Startup, language and notifications.">
      <Startup s={s} />
      <Appearance s={s} />
      <SettingsSection title="Tray">
        <SettingRow
          label="Closing the window"
          description="Keeps Speak Kit in the tray so the extension and the shortcuts keep working. Quit from the tray menu."
          control={<span>Keeps running</span>}
        />
      </SettingsSection>
      <SettingsSection title="Privacy">
        <SettingRow
          label="Offer to read long text I copy"
          description={clipboardNote(s.platform)}
          control={<Toggle aria-label="Clipboard prompt" checked={s.config.clipboardPrompt} onChange={(v) => api.patchConfig({ clipboardPrompt: v })} />}
        />
      </SettingsSection>
    </Page>
  );
}
