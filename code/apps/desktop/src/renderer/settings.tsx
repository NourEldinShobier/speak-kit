/**
 * Settings page registry: ONE line per settings page id in SETTINGS_PAGES below. To build one, create renderer/features/<name>/
 * (public interface in index.ts) and replace that line's `StubPage`. The sidebar list lives in routes.ts. Main pages have their registry in page-registry.tsx.
 */
import type { ComponentType } from "react";
import type { AppState, SettingsSub } from "../shared/ipc";
import {
  AboutPage,
  AccessibilityPage,
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
import { StubPage } from "./StubPage";
import { registerCaptureExperiments } from "./features/capture";
import "./settings.css";

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
  automation: () => <StubPage setting="automation" />,
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
