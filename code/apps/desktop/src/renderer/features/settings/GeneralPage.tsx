import { Button, Select, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import type { Config } from "../../../shared/schemas";
import { closeHint, effectiveCloseAction } from "../../../shared/settings/behaviour";
import { api, Page } from "../../ui";
import { Advanced } from "./Advanced";
import { rowAttr } from "./focus";

const patch = (p: Parameters<typeof api.patchConfig>[0]) => api.patchConfig(p);

function Startup({ s }: { s: AppState }) {
  return (
    <SettingsSection title="Startup">
      <SettingRow
        {...rowAttr("general/launch")}
        label="Launch at login"
        description="Start Speak Kit when you sign in so the extension is ready."
        control={<Toggle aria-label="Launch at login" checked={s.launchAtLogin} onChange={(v) => api.setLaunchAtLogin(v)} />}
      />
      <SettingRow
        {...rowAttr("general/minimized")}
        label="Start minimized to tray"
        description="When it starts at login, stay in the tray instead of opening a window."
        control={<Toggle aria-label="Start minimized to tray" checked={s.config.startMinimized} onChange={(v) => patch({ startMinimized: v })} />}
      />
    </SettingsSection>
  );
}

function Appearance({ c }: { c: Config }) {
  return (
    <>
      <SettingsSection title="Appearance">
        <SettingRow
          {...rowAttr("general/language")}
          className="lm-row--control"
          label="Language"
          description="The language of menus and messages. Anything else falls back to English."
          control={
            <Select
              label="Language"
              value={c.language}
              onChange={(v) => patch({ language: v as Config["language"] })}
              options={[
                { value: "system", label: "System default" },
                { value: "en", label: "English" },
              ]}
            />
          }
        />
      </SettingsSection>
    </>
  );
}

function Tray({ s }: { s: AppState }) {
  const c = s.config;
  return (
    <SettingsSection title="Tray">
      <SettingRow
        {...rowAttr("general/close")}
        className="lm-row--control"
        label="Closing the window"
        description={closeHint(c)}
        control={
          <Select
            label="Closing the window"
            value={effectiveCloseAction(c)}
            disabled={c.hideTrayIcon}
            onChange={(v) => patch({ closeAction: v as Config["closeAction"] })}
            options={[
              { value: "hide", label: "Keeps running" },
              { value: "quit", label: "Quits" },
            ]}
          />
        }
      />
      <SettingRow
        {...rowAttr("general/tray")}
        label="Show the tray icon"
        description={s.platform === "darwin" ? "The icon in the menu bar. Hidden, closing the window quits." : "The icon in the notification area. Hidden, closing the window quits."}
        control={<Toggle aria-label="Show the tray icon" checked={!c.hideTrayIcon} onChange={(v) => patch({ hideTrayIcon: !v })} />}
      />
    </SettingsSection>
  );
}

export function GeneralPage({ s }: { s: AppState }) {
  return (
    <Page title="General" lead="Startup, language and the tray.">
      <Startup s={s} />
      <Appearance c={s.config} />
      <Tray s={s} />
      <Advanced page="general" subtitle="Settings file and setup." count={2}>
        <SettingsSection title="Settings file and setup">
          <SettingRow
            {...rowAttr("general/settings-file")}
            label="Settings file"
            description="Your settings are kept in one file in the data folder. A repaired file is backed up next to it."
            control={<Button onClick={() => api.openPath("data")}>Show in folder</Button>}
          />
          <SettingRow
            {...rowAttr("general/setup-again")}
            label="Run setup again"
            description="Go through the first-run steps once more. Your library and settings stay."
            control={<Button onClick={() => patch({ setupDone: false })}>Run setup</Button>}
          />
        </SettingsSection>
      </Advanced>
    </Page>
  );
}
