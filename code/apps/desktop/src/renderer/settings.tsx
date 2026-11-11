import { lazy, Suspense } from "react";
import { Button, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState, SettingsSub } from "../shared/ipc";
import { api, Page } from "./ui";
import { BrowserPage, GeneralPage, MemoryPage, NotificationsPage, SETTINGS_NAV, ShortcutsPage, StoragePage, VoicePage } from "./features/settings";
import { UpdateCard } from "./UpdateCard";
import "./settings.css";

export { SETTINGS_NAV };

// Dictation is rarely opened: its pages, its styles and the code behind them load on first use.
const DictationPage = lazy(() => import("./features/dictation").then((m) => ({ default: m.DictationPage })));
const DictationHistoryPage = lazy(() => import("./features/dictation").then((m) => ({ default: m.DictationHistoryPage })));

function About({ s }: { s: AppState }) {
  return (
    <Page title="About" lead="Speak Kit reads text out loud on your own computer.">
      <SettingsSection title="Versions">
        <SettingRow label="Speak Kit" control={<span data-testid="about-version">{s.version}</span>} />
        <SettingRow label="Voice engine" control={<span>Kokoro-82M</span>} />
        <SettingRow label="Platform" control={<span>{s.platform}</span>} />
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

export function Settings({ s, sub, go }: { s: AppState; sub: SettingsSub; go?: (sub: SettingsSub) => void }) {
  switch (sub) {
    case "dictation":
      return (
        <Suspense fallback={null}>
          <DictationPage openHistory={() => go?.("dictation-history")} />
        </Suspense>
      );
    case "dictation-history":
      return (
        <Suspense fallback={null}>
          <DictationHistoryPage back={() => go?.("dictation")} />
        </Suspense>
      );
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
