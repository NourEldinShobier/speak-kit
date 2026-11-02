import { Button, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState, SettingsSub } from "../shared/ipc";
import { api, Page } from "./ui";
import { BrowserPage, GeneralPage, MemoryPage, NotificationsPage, SETTINGS_NAV, ShortcutsPage, StoragePage, VoicePage } from "./features/settings";
import { UpdateCard } from "./UpdateCard";

export { SETTINGS_NAV };

const LICENSES: [string, string][] = [
  ["wasm-media-encoders (MP3 export, built on LAME)", "MIT, LAME is LGPL-2.1"],
  ["electron-updater", "MIT"],
  ["koffi (reading the selection)", "MIT"],
  ["Kokoro-82M (model)", "Apache-2.0"],
  ["onnxruntime-node", "MIT"],
  ["Electron", "MIT"],
  ["React", "MIT"],
  ["Radix UI", "MIT"],
  ["Tabler Icons", "MIT"],
  ["valibot", "MIT"],
  ["electron-log, electron-store", "MIT"],
];

function About({ s }: { s: AppState }) {
  return (
    <Page title="About" lead="Speak Kit reads text out loud on your own computer.">
      <SettingsSection title="Versions">
        <SettingRow label="Speak Kit" control={<span data-testid="about-version">{s.version}</span>} />
        <SettingRow label="Voice engine" control={<span>Kokoro-82M</span>} />
        <SettingRow label="Platform" control={<span>{s.platform}</span>} />
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
      <SettingsSection title="Open source licenses">
        {LICENSES.map(([k, l]) => (
          <SettingRow key={k} label={k} control={<span>{l}</span>} />
        ))}
      </SettingsSection>
      <div>
        <Button iconLeft="folder" onClick={() => api.openPath("logs")}>
          Open log folder
        </Button>
      </div>
    </Page>
  );
}

export function Settings({ s, sub }: { s: AppState; sub: SettingsSub }) {
  switch (sub) {
    case "voice":
      return <VoicePage s={s} />;
    case "shortcuts":
      return <ShortcutsPage s={s} />;
    case "notifications":
      return <NotificationsPage s={s} />;
    case "memory":
      return <MemoryPage s={s} />;
    case "browser":
      return <BrowserPage s={s} />;
    case "storage":
      return <StoragePage />;
    case "about":
      return <About s={s} />;
    default:
      return <GeneralPage s={s} />;
  }
}
