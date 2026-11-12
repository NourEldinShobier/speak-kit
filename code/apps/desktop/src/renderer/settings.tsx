/**
 * Settings page registry: ONE line per settings page id in SETTINGS_PAGES below. To build one, create renderer/features/<name>/
 * (public interface in index.ts). The sidebar list lives in routes.ts. Main pages have their registry in page-registry.tsx.
 */
import type { ComponentType } from "react";
import type { AppState, SettingsSub } from "../shared/ipc";
import {
  AboutPage,
  AccessibilityPage,
  AutomationPage,
  BrowserPage,
  DiagnosticsPage,
  ExperimentsPage,
  GeneralPage,
  MemoryPage,
  NotificationsPage,
  PrivacyPage,
  SettingsFrame,
  ShortcutsPage,
  StoragePage,
  VoicePage,
} from "./features/settings";
import { MeetingsPage } from "./features/meetings";
import { registerCaptureExperiments } from "./features/capture";
import { ExperimentsPage } from "./features/experiments";
import { UpdateCard } from "./UpdateCard";
import "./settings.css";

/** Run setup again: downloaded models and settings stay, the first-run steps are shown again from the model step. */
function SetupSection() {
  return (
    <SettingsSection title="Setup" description="Go through the first-run steps again, from the model step: voice model, dictation language, practice and the browser extension.">
      <SettingRow
        className="lm-row--control"
        label="Run setup again"
        description="Downloaded models and your settings are kept."
        control={
          <Button aria-label="Run setup again" onClick={() => void api.patchConfig({ setupDone: false, setupSkipped: false, setupStep: 1 })}>
            Run setup again
          </Button>
        }
      />
    </SettingsSection>
  );
}

function About({ s }: { s: AppState }) {
  return (
    <Page title="About" lead="Speak Kit reads text out loud on your own computer.">
      <SettingsSection title="Versions">
        <SettingRow label="Speak Kit" control={<span data-testid="about-version">{s.version}</span>} />
        <SettingRow label="Voice engine" control={<span>Kokoro-82M</span>} />
        <SettingRow label="Platform" control={<span>{s.platform}</span>} />
      </SettingsSection>
      <SetupSection />
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

registerCaptureExperiments();

const SETTINGS_PAGES: Record<SettingsSub, ComponentType<{ s: AppState }>> = {
  general: GeneralPage,
  voice: VoicePage,
  shortcuts: ShortcutsPage,
  notifications: NotificationsPage,
  accessibility: AccessibilityPage,
  performance: MemoryPage,
  storage: StoragePage,
  privacy: PrivacyPage,
  meetings: MeetingsPage,
  automation: AutomationPage,
  experiments: ExperimentsPage,
  browser: BrowserPage,
  diagnostics: DiagnosticsPage,
  about: AboutPage,
};

export function Settings({ s, sub }: { s: AppState; sub: SettingsSub }) {
  const Body = SETTINGS_PAGES[sub];
  return (
    <SettingsFrame s={s} sub={sub}>
      <Body s={s} />
    </SettingsFrame>
  );
}
