/**
 * Settings page registry: ONE line per settings page id in SETTINGS_PAGES below. To build one, create renderer/features/<name>/
 * (public interface in index.ts) and replace that line's `StubPage`. The sidebar list lives in routes.ts. Main pages have their registry in page-registry.tsx.
 */
import type { ComponentType } from "react";
import { Button, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState, SettingsSub } from "../shared/ipc";
import { api, Page } from "./ui";
import { BrowserPage, GeneralPage, MemoryPage, NotificationsPage, ShortcutsPage, StoragePage, VoicePage } from "./features/settings";
import { StubPage } from "./StubPage";
import { UpdateCard } from "./UpdateCard";
import "./settings.css";

function About({ s }: { s: AppState }) {
  return (
    <Page title="About" lead="Speak Kit reads text out loud on your own computer.">
      <SettingsSection title="Versions">
        <SettingRow label="Speak Kit" control={<span data-testid="about-version">{s.version}</span>} />
        <SettingRow label="Voice engine" control={<span>Kokoro-82M</span>} />
        <SettingRow label="Platform" control={<span>{s.platform}</span>} />
      </SettingsSection>
      <SettingsSection title="Setup" description="Go through the first-run steps again: language, speech model, practice and the browser extension.">
        <SettingRow
          className="lm-row--control"
          label="Run setup again"
          description="Downloaded models and your settings are kept."
          control={
            <Button aria-label="Run setup again" onClick={() => void api.patchConfig({ setupDone: false, setupSkipped: false, setupStep: 0 })}>
              Run setup again
            </Button>
          }
        />
      </SettingsSection>
      <SettingsSection title="Uninstalling">
        <SettingRow
          label="Downloaded models"
          description={
            s.platform === "darwin"
              ? "Before you drag Speak Kit to the Trash, use Settings > Storage > Delete downloaded models. Otherwise remove ~/Library/Application Support/@speakkit/desktop yourself."
              : "Uninstalling Speak Kit removes the downloaded models. Your library and settings stay in the data folder."
          }
        />
      </SettingsSection>
      <SettingsSection
        title="Updates"
        description={
          s.platform === "darwin"
            ? "Speak Kit looks for new versions on GitHub Releases. On macOS you download and install them yourself."
            : "Updates come from GitHub Releases. They download in the background and are never installed without you."
        }
      >
        <div className="sk-pad" data-testid="update-section">
          <UpdateCard s={s} />
        </div>
        <SettingRow
          label="Check automatically"
          description="Once a day while Speak Kit runs."
          control={<Toggle aria-label="Check for updates automatically" checked={s.config.autoUpdate} onChange={(v) => api.patchConfig({ autoUpdate: v })} />}
        />
      </SettingsSection>
      <div>
        <Button iconLeft="folder" onClick={() => api.openPath("logs")}>
          Open log folder
        </Button>
      </div>
    </Page>
  );
}

const SETTINGS_PAGES: Record<SettingsSub, ComponentType<{ s: AppState }>> = {
  general: GeneralPage,
  voice: VoicePage,
  shortcuts: ShortcutsPage,
  notifications: NotificationsPage,
  accessibility: () => <StubPage setting="accessibility" />,
  performance: MemoryPage,
  storage: StoragePage,
  privacy: () => <StubPage setting="privacy" />,
  meetings: () => <StubPage setting="meetings" />,
  automation: () => <StubPage setting="automation" />,
  experiments: () => <StubPage setting="experiments" />,
  browser: BrowserPage,
  diagnostics: () => <StubPage setting="diagnostics" />,
  about: About,
};

export function Settings({ s, sub }: { s: AppState; sub: SettingsSub }) {
  const Body = SETTINGS_PAGES[sub];
  return <Body s={s} />;
}
